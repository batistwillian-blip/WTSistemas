// Sincronização dos títulos de Receber e Pagar do CHServer para os lançamentos da empresa configurada.
// Usado pela importação automática, pelo botão do administrador, pela rota agendada e pelo script.
import { and, eq, gte, inArray, isNull, like, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, auditLog, companies, integrationRuns, integrationSettings, sales, transactions } from "@/db/schema";
import { chGet, mapSale, mapTitle, readChConfig, titleState, toChDate, type ChConfig, type ChSale, type ChTitle } from "./chserver";
import { addDays, addMonths, formatMoney, monthEnd, monthStart, today } from "./format";
import { decryptSecret } from "./secret-box";

export type SyncResult = { ok: boolean; message: string; created: number; updated: number };
export type ChSettings = {
  cfg: ChConfig;
  companyId: number;
  accountId: number;
  origin: "tela" | "variaveis";
  // O contas a receber do CH não é usado: só Pagar é importado.
  kinds: "Pagar"[];
  sales: boolean;
  balance: BalanceRules;
  // Ainda falta trazer o histórico de vendas (12 meses) uma vez.
  salesHistory: boolean;
};

/** O que do CH pode mexer no saldo. Por padrão nada: o saldo é lançado à mão como saldo inicial. */
export type BalanceRules = { paid: boolean; sales: boolean; from: string | null };

/** Um pagamento ou venda nesta data entra no saldo? */
export function countsInBalance(rules: BalanceRules, what: "paid" | "sales", date: string): boolean {
  return rules[what] && (!rules.from || date >= rules.from);
}

// Janela de vencimentos lida a cada importação: 2 anos para trás (pega abertos antigos) e 5 para frente (parcelamentos longos).
const PAST_DAYS = 730;
const FUTURE_DAYS = 1826;

/** Configuração salva na tela tem prioridade; sem ela, usa as variáveis CHSERVER_* do servidor. */
export async function loadChSettings(): Promise<ChSettings | null> {
  const [row] = await db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver"));
  if (row) {
    if (!row.enabled) return null;
    return {
      cfg: { baseUrl: row.baseUrl, cnpj: row.cnpj, companyKey: row.companyKey, token: decryptSecret(row.tokenEncrypted) },
      companyId: row.companyId,
      accountId: row.accountId,
      origin: "tela",
      kinds: row.importPayables ? ["Pagar"] : [],
      sales: row.importSales,
      balance: { paid: row.paidAffectBalance, sales: row.salesAffectBalance, from: row.balanceFrom },
      salesHistory: !row.salesBackfilledAt,
    };
  }
  const cfg = readChConfig();
  if (!cfg) return null;
  const slug = process.env.CHSERVER_EMPRESA_SLUG || "primetech-loja";
  const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
  if (!company) throw new Error(`Empresa ${slug} não encontrada.`);
  const accountName = process.env.CHSERVER_CONTA_NOME || "Banco";
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.companyId, company.id), eq(accounts.name, accountName)));
  if (!account) throw new Error(`Conta "${accountName}" não encontrada em ${company.name}.`);
  return { cfg, companyId: company.id, accountId: account.id, origin: "variaveis", kinds: ["Pagar"], sales: true, balance: { paid: false, sales: false, from: null }, salesHistory: false };
}

/** Testa a conexão lendo o cadastro da empresa no CHServer (somente leitura). */
export async function testChConnection(cfg: ChConfig): Promise<string> {
  const rows = await chGet(cfg, "Empresa");
  const e = rows[0];
  if (!e) return "Conectado, mas o CHServer não devolveu dados da empresa. Confira a chave da empresa.";
  const name = String(e.FANTASIA || e.RAZAOSOCIAL || "empresa sem nome");
  return `Conexão funcionando: ${name}.`;
}

let running: Promise<SyncResult> | null = null;

export function syncChServer(triggeredBy: { id: number; name: string } | null = null): Promise<SyncResult> {
  // Evita duas importações ao mesmo tempo (botão + automática).
  running ??= runSync(triggeredBy).finally(() => {
    running = null;
  });
  return running;
}

async function runSync(triggeredBy: { id: number; name: string } | null): Promise<SyncResult> {
  const [run] = await db.insert(integrationRuns).values({ source: "chserver" }).returning();
  const finish = async (r: SyncResult) => {
    await db
      .update(integrationRuns)
      .set({ finishedAt: new Date(), ok: r.ok, message: r.message, created: r.created, updated: r.updated })
      .where(eq(integrationRuns.id, run.id));
    return r;
  };
  try {
    const settings = await loadChSettings();
    if (!settings) return finish({ ok: false, message: "Integração não configurada.", created: 0, updated: 0 });
    const { cfg, companyId, accountId, kinds } = settings;
    if (kinds.length === 0 && !settings.sales) return finish({ ok: false, message: "Nada marcado para importar.", created: 0, updated: 0 });

    const fromIso = addDays(today(), -PAST_DAYS);
    const toIso = addDays(today(), FUTURE_DAYS);
    const titles: (ChTitle & { offBalance: boolean })[] = [];
    // Cancelados e excluídos no CH: saem do caixa mesmo que sejam muitos (a proteção contra resposta cortada não vale para eles).
    const discarded = new Set<string>();
    const states: Record<string, number> = {};
    const fields = new Set<string>();
    for (const kind of kinds) {
      const records = await chGet(cfg, kind, [toChDate(fromIso), toChDate(toIso)]);
      for (const r of records) {
        Object.keys(r).forEach((k) => fields.add(k));
        const state = titleState(kind, r);
        const raw = `STATUS=${r.STATUS ?? "-"} ATIVO=${r.ATIVO ?? "-"}`;
        states[raw] = (states[raw] ?? 0) + 1;
        if ((state === "cancelado" || state === "excluido") && r.CHAVE != null && r.CHAVE !== "") {
          discarded.add(`${kind.toLowerCase()}:${String(r.CHAVE)}`);
          continue;
        }
        const t = mapTitle(kind, r);
        if (!t) continue;
        // Pago fora das regras do saldo: fica guardado só para consulta (filtro "Pagos"), sem mexer no saldo.
        titles.push({ ...t, offBalance: !!t.paidAt && !countsInBalance(settings.balance, "paid", t.paidAt) });
      }
    }

    let created = 0;
    let updated = 0;
    for (const t of titles) {
      const [row] = await db
        .insert(transactions)
        .values({ ...t, companyId, accountId, source: "chserver" })
        .onConflictDoUpdate({
          target: [transactions.source, transactions.externalId],
          set: {
            type: t.type,
            description: t.description,
            counterpart: t.counterpart,
            amount: t.amount,
            dueDate: t.dueDate,
            paidAt: t.paidAt,
            externalCategory: t.externalCategory,
            offBalance: t.offBalance,
            deletedAt: null,
            updatedAt: new Date(),
          },
          // Só regrava se algo mudou (inclusive título que tinha sumido e voltou), para o contador refletir alterações reais.
          setWhere: sql`(${transactions.amount}, ${transactions.dueDate}, ${transactions.paidAt}, ${transactions.description}, ${transactions.offBalance}, ${transactions.deletedAt} is null)
            is distinct from (excluded.valor, excluded.vencimento, excluded.pago_em, excluded.descricao, excluded.fora_do_saldo, true)`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      if (!row) continue;
      if (row.inserted) created++;
      else updated++;
    }

    // Títulos importados antes que não vieram mais do CHServer (excluídos ou cancelados lá) saem do caixa.
    // Só olha a mesma janela de vencimentos e os tipos importados, e nunca mexe em lançamentos manuais.
    const seen = new Set(titles.map((t) => t.externalId));
    const prefixes = kinds.map((k) => k.toLowerCase() + ":");
    const existing = await db
      .select({ id: transactions.id, externalId: transactions.externalId })
      .from(transactions)
      .where(
        and(
          eq(transactions.source, "chserver"),
          isNull(transactions.deletedAt),
          gte(transactions.dueDate, fromIso),
          lte(transactions.dueDate, toIso),
        ),
      );
    const ours = existing.filter((e) => e.externalId && prefixes.some((p) => e.externalId!.startsWith(p)) && !seen.has(e.externalId));
    const canceled = ours.filter((e) => discarded.has(e.externalId!));
    const gone = ours.filter((e) => !discarded.has(e.externalId!));
    // Proteção: se a resposta veio vazia ou cortada, não apaga em massa o que só "sumiu"; só avisa.
    const suspicious = gone.length > 20 && gone.length > existing.length / 2;
    const toRemove = suspicious ? canceled : ours;
    if (toRemove.length) {
      await db
        .update(transactions)
        .set({ deletedAt: new Date() })
        .where(inArray(transactions.id, toRemove.map((g) => g.id)));
    }
    const removed = toRemove.length;
    const warning = suspicious ? ` Atenção: ${gone.length} títulos não vieram nesta leitura; por segurança eles não foram removidos.` : "";
    const open = titles.filter((t) => !t.paidAt);
    const paidOff = titles.filter((t) => t.offBalance).length;
    const openTotal = open.reduce((sum, t) => sum + t.amount, 0);

    const salesInfo = settings.sales ? await syncSales(cfg, companyId, accountId, settings.balance, settings.salesHistory) : null;
    const parts: string[] = [];
    if (kinds.length)
      parts.push(
        `Contas a pagar: ${open.length} em aberto (${formatMoney(openTotal)}) e ${titles.length - open.length} pagas${paidOff ? ` (${paidOff} só para consulta, fora do saldo)` : ""}; ${created} novas, ${updated} atualizadas${removed ? `, ${removed} removidas por estarem canceladas, excluídas ou não existirem mais no CHServer` : ""}${discarded.size ? `; ${discarded.size} canceladas ou excluídas no CH foram ignoradas` : ""}.${warning}`,
      );
    if (salesInfo) parts.push(salesInfo.message);
    const message = parts.join(" ");
    await db.insert(auditLog).values({
      userId: triggeredBy?.id ?? null,
      userName: triggeredBy?.name ?? "Importação automática",
      companyId,
      action: "sincronizar",
      entity: "integracao_chserver",
      after: {
        created,
        updated,
        removidos: removed,
        lidos: titles.length,
        ignorados: discarded.size,
        abertos: open.length,
        totalAberto: openTotal,
        situacoes: states,
        campos: [...fields].sort(),
        janela: [fromIso, toIso],
        tipos: kinds,
        vendas: salesInfo?.count ?? null,
      },
    });
    return finish({ ok: true, message, created, updated });
  } catch (e) {
    // As mensagens de erro nunca incluem o token.
    const message = e instanceof Error ? e.message.slice(0, 300) : "Erro desconhecido.";
    return finish({ ok: false, message, created: 0, updated: 0 });
  }
}

/** Data da última importação bem-sucedida ou tentada, para decidir se já está na hora de rodar de novo. */
export async function lastRunAt(): Promise<Date | null> {
  const [row] = await db
    .select({ at: sql<Date>`max(${integrationRuns.startedAt})` })
    .from(integrationRuns)
    .where(eq(integrationRuns.source, "chserver"));
  return row?.at ? new Date(row.at) : null;
}

const SALES_DAYS = 40;
const SALES_HISTORY_MONTHS = 13;

async function saveSales(list: ChSale[], companyId: number, now: Date) {
  for (const s of list) {
    await db
      .insert(sales)
      .values({ ...s, companyId, updatedAt: now })
      .onConflictDoUpdate({ target: sales.externalId, set: { ...s, companyId, updatedAt: now, deletedAt: null } });
  }
}

/**
 * Importa as notas de saída dos últimos 40 dias para a tabela de vendas (na primeira vez, também os últimos 13 meses,
 * mês a mês, para o comparativo) e mantém uma entrada por dia no caixa ("Vendas do dia") quando as vendas contam no saldo.
 */
async function syncSales(
  cfg: ChConfig,
  companyId: number,
  accountId: number,
  balance: BalanceRules,
  needsHistory: boolean,
): Promise<{ count: number; message: string }> {
  const fromIso = addDays(today(), -SALES_DAYS);
  const toIso = today();
  const now = new Date();
  let history = 0;
  if (needsHistory) {
    const start = addMonths(monthStart(today()), -(SALES_HISTORY_MONTHS - 1));
    for (let m = start; m < fromIso; m = addMonths(m, 1)) {
      const end = monthEnd(m) < fromIso ? monthEnd(m) : addDays(fromIso, -1);
      const part = (await chGet(cfg, "NFSaida", [toChDate(m), toChDate(end)])).map(mapSale).filter((s): s is ChSale => s !== null);
      await saveSales(part, companyId, now);
      history += part.length;
    }
    await db.update(integrationSettings).set({ salesBackfilledAt: now }).where(eq(integrationSettings.source, "chserver"));
  }
  const records = await chGet(cfg, "NFSaida", [toChDate(fromIso), toChDate(toIso)]);
  const list = records.map(mapSale).filter((s): s is ChSale => s !== null);
  await saveSales(list, companyId, now);
  // Notas que sumiram do CHServer dentro da janela saem da lista (com a mesma trava contra remoção em massa).
  const seen = new Set(list.map((s) => s.externalId));
  const existing = await db
    .select({ id: sales.id, externalId: sales.externalId })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), isNull(sales.deletedAt), gte(sales.date, fromIso), lte(sales.date, toIso)));
  const gone = existing.filter((e) => !seen.has(e.externalId));
  if (gone.length && !(gone.length > 20 && gone.length > existing.length / 2)) {
    await db.update(sales).set({ deletedAt: now }).where(inArray(sales.id, gone.map((g) => g.id)));
  }

  // Uma entrada por dia no caixa, recalculada a partir das vendas guardadas.
  const daily = await db
    .select({
      date: sales.date,
      n: sql<number>`count(*) filter (where not ${sales.canceled})::int`,
      net: sql<string>`coalesce(sum(greatest(${sales.total} - ${sales.returned}, 0)) filter (where not ${sales.canceled}), 0)`,
    })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), isNull(sales.deletedAt), gte(sales.date, fromIso), lte(sales.date, toIso)))
    .groupBy(sales.date);
  // Só os dias que contam no saldo viram lançamento; os outros ficam só na tela de vendas.
  const byDay = new Map(daily.filter((d) => countsInBalance(balance, "sales", d.date)).map((d) => [d.date, { n: d.n, net: Number(d.net) }]));
  const current = await db
    .select({ id: transactions.id, externalId: transactions.externalId, dueDate: transactions.dueDate })
    .from(transactions)
    .where(and(eq(transactions.source, "chserver"), like(transactions.externalId, "vendas:%"), isNull(transactions.deletedAt)));
  for (const [date, d] of byDay) {
    if (d.net <= 0) continue;
    const values = {
      type: "entrada" as const,
      description: `Vendas do dia ${date.slice(8, 10)}/${date.slice(5, 7)} (${d.n} ${d.n === 1 ? "nota" : "notas"})`,
      amount: d.net,
      dueDate: date,
      paidAt: date,
      externalCategory: "Vendas (CHServer)",
      offBalance: false,
    };
    await db
      .insert(transactions)
      .values({ ...values, companyId, accountId, source: "chserver", externalId: `vendas:${date}` })
      .onConflictDoUpdate({ target: [transactions.source, transactions.externalId], set: { ...values, deletedAt: null, updatedAt: now } });
  }
  // Lançamentos de dias fora do saldo não são mexidos aqui: só saem pelo botão "Zerar o saldo importado".
  const stale = current.filter(
    (c) => c.dueDate >= fromIso && c.dueDate <= toIso && countsInBalance(balance, "sales", c.dueDate) && !((byDay.get(c.dueDate)?.net ?? 0) > 0),
  );
  if (stale.length) await db.update(transactions).set({ deletedAt: now }).where(inArray(transactions.id, stale.map((t) => t.id)));

  const total = [...byDay.values()].reduce((s, d) => s + d.net, 0);
  return {
    count: list.length,
    message:
      (balance.sales
        ? `Vendas: ${list.length} notas dos últimos ${SALES_DAYS} dias, ${formatMoney(total)} lançados no saldo por dia.`
        : `Vendas: ${list.length} notas dos últimos ${SALES_DAYS} dias (só na tela de vendas, fora do saldo).`) +
      (needsHistory ? ` Histórico de ${SALES_HISTORY_MONTHS} meses trazido: ${history} notas.` : ""),
  };
}

/** Lançamentos importados do CH que hoje mexem no saldo mas estão fora das regras salvas (pagos e vendas do dia). Zerar marca como fora do saldo, sem apagar. */
export function importedOutsideBalance(rules: BalanceRules) {
  const outside = (flag: boolean) => (flag ? (rules.from ? sql`${transactions.paidAt} < ${rules.from}` : sql`false`) : sql`true`);
  return and(
    eq(transactions.source, "chserver"),
    isNull(transactions.deletedAt),
    eq(transactions.offBalance, false),
    sql`${transactions.paidAt} is not null`,
    sql`((${transactions.externalId} like 'pagar:%' and ${outside(rules.paid)}) or (${transactions.externalId} like 'vendas:%' and ${outside(rules.sales)}))`,
  );
}
