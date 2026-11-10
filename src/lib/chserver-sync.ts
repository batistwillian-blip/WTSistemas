// Sincronização dos títulos de Receber e Pagar do CHServer para os lançamentos da empresa configurada.
// Usado pela importação automática, pelo botão do administrador, pela rota agendada e pelo script.
import { and, eq, gte, inArray, isNull, like, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { linkPeople } from "./people";
import { accounts, auditLog, companies, integrationRuns, integrationSettings, paymentMethodAccounts, sales, transactions } from "@/db/schema";
import { chGet, defaultDays, mapSale, mapTitle, readChConfig, saleNet, salePayments, titleState, toChDate, type ChConfig, type ChSale, type ChTitle } from "./chserver";
import { addDays, addMonths, formatMoney, monthEnd, monthStart, today } from "./format";
import { decryptSecret } from "./secret-box";

export type SyncResult = { ok: boolean; message: string; created: number; updated: number };
export type ChSettings = {
  cfg: ChConfig;
  companyId: number;
  accountId: number;
  /** Conta de onde saem os títulos pagos no CH (se vazia, a mesma dos títulos). */
  paidAccountId: number | null;
  origin: "tela" | "variaveis";
  // Títulos importados: contas a pagar e, se marcado, contas a receber.
  kinds: ("Receber" | "Pagar")[];
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
      paidAccountId: row.paidAccountId,
      origin: "tela",
      kinds: [...(row.importPayables ? (["Pagar"] as const) : []), ...(row.importReceivables ? (["Receber"] as const) : [])],
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
  const accountName = process.env.CHSERVER_CONTA_NOME || "Cresol";
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.companyId, company.id), eq(accounts.name, accountName)));
  if (!account) throw new Error(`Conta "${accountName}" não encontrada em ${company.name}.`);
  return { cfg, companyId: company.id, accountId: account.id, paidAccountId: null, origin: "variaveis", kinds: ["Pagar"], sales: true, balance: { paid: false, sales: false, from: null }, salesHistory: false };
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
        // Recebimento com "vendas do dia no saldo" ligado também fica fora: a venda já entrou no saldo no dia dela (não conta em dobro).
        const outside = !countsInBalance(settings.balance, "paid", t.paidAt ?? "") || (kind === "Receber" && settings.balance.sales);
        titles.push({ ...t, offBalance: !!t.paidAt && outside });
      }
    }

    let created = 0;
    let updated = 0;
    for (const t of titles) {
      // Pago no CH sai da conta escolhida para os pagos; em aberto fica na conta dos títulos.
      const titleAccount = t.paidAt && settings.paidAccountId ? settings.paidAccountId : accountId;
      const [row] = await db
        .insert(transactions)
        .values({ ...t, companyId, accountId: titleAccount, source: "chserver" })
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
            accountId: titleAccount,
            deletedAt: null,
            updatedAt: new Date(),
          },
          // Só regrava se algo mudou (inclusive título que tinha sumido e voltou), para o contador refletir alterações reais.
          setWhere: sql`(${transactions.amount}, ${transactions.dueDate}, ${transactions.paidAt}, ${transactions.description}, ${transactions.offBalance}, ${transactions.accountId}, ${transactions.deletedAt} is null)
            is distinct from (excluded.valor, excluded.vencimento, excluded.pago_em, excluded.descricao, excluded.fora_do_saldo, excluded.conta_id, true)`,
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
    const openTotal = open.reduce((sum, t) => sum + t.amount, 0);
    const summary = (type: "saida" | "entrada", label: string, paidWord: string) => {
      const list = titles.filter((t) => t.type === type);
      const o = list.filter((t) => !t.paidAt);
      const off = list.filter((t) => t.offBalance).length;
      return `${label}: ${o.length} em aberto (${formatMoney(o.reduce((s, t) => s + t.amount, 0))}) e ${list.length - o.length} ${paidWord}${off ? ` (${off} só para consulta, fora do saldo)` : ""}.`;
    };

    const salesInfo = settings.sales ? await syncSales(cfg, companyId, accountId, settings.balance, settings.salesHistory) : null;
    const parts: string[] = [];
    if (kinds.includes("Pagar")) parts.push(summary("saida", "Contas a pagar", "pagas"));
    if (kinds.includes("Receber")) parts.push(summary("entrada", "Contas a receber", "recebidas"));
    if (kinds.length)
      parts.push(
        `Títulos: ${created} novos, ${updated} atualizados${removed ? `, ${removed} removidos por estarem cancelados, excluídos ou não existirem mais no CHServer` : ""}${discarded.size ? `; ${discarded.size} cancelados ou excluídos no CH foram ignorados` : ""}.${warning}`,
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
    // Fornecedores novos vindos do CH ganham cadastro (com código) e ficam ligados às contas.
    await linkPeople([companyId]).catch((e) => console.error("Falha ao cadastrar fornecedores do CH:", e));
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

  // Uma entrada por dia e por forma de pagamento, na conta configurada para a forma e no dia em que o dinheiro cai
  // (data da venda + prazo, nunca a data da importação: importar dias depois dá o mesmo resultado).
  const daySales = await db
    .select({ date: sales.date, total: sales.total, returned: sales.returned, canceled: sales.canceled, payment: sales.payment })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), isNull(sales.deletedAt), gte(sales.date, fromIso), lte(sales.date, toIso)));
  const methods = new Map((await db.select().from(paymentMethodAccounts).where(eq(paymentMethodAccounts.companyId, companyId))).map((m) => [m.method, m]));
  const groups = new Map<string, { date: string; method: string; n: number; net: number }>();
  for (const s of daySales) {
    // Só os dias que contam no saldo viram lançamento; os outros ficam só na tela de vendas.
    if (!countsInBalance(balance, "sales", s.date)) continue;
    for (const p of salePayments(s.payment, saleNet(s))) {
      const key = `vendas:${s.date}:${p.method}`;
      const g = groups.get(key) ?? { date: s.date, method: p.method, n: 0, net: 0 };
      g.n += 1;
      g.net += p.amount;
      groups.set(key, g);
    }
  }
  const d0 = today();
  const current = await db
    .select({ id: transactions.id, externalId: transactions.externalId })
    .from(transactions)
    .where(and(eq(transactions.source, "chserver"), like(transactions.externalId, "vendas:%"), isNull(transactions.deletedAt), eq(transactions.companyId, companyId)));
  for (const [externalId, g] of groups) {
    if (g.net <= 0) continue;
    const map = methods.get(g.method);
    const days = map?.days ?? defaultDays(g.method);
    const credit = addDays(g.date, days);
    const values = {
      type: "entrada" as const,
      description: `Vendas ${g.date.slice(8, 10)}/${g.date.slice(5, 7)} · ${g.method}${days ? ` (D+${days})` : ""} (${g.n} ${g.n === 1 ? "nota" : "notas"})`,
      amount: g.net,
      dueDate: credit,
      // Cartão que ainda não caiu fica a receber (aparece na programação) até o dia do crédito.
      paidAt: credit <= d0 ? credit : null,
      accountId: map?.accountId ?? accountId,
      externalCategory: "Vendas (CHServer)",
      offBalance: false,
    };
    await db
      .insert(transactions)
      .values({ ...values, companyId, source: "chserver", externalId })
      .onConflictDoUpdate({ target: [transactions.source, transactions.externalId], set: { ...values, deletedAt: null, updatedAt: now } });
  }
  // Lançamentos de dias fora do saldo não são mexidos aqui: só saem pelo botão "Zerar o saldo importado".
  // A data da venda vem do código ("vendas:AAAA-MM-DD..."), não do vencimento (que pode ser o dia do crédito).
  const saleDate = (id: string) => id.slice(7, 17);
  const stale = current.filter((c) => {
    const d = saleDate(c.externalId!);
    return d >= fromIso && d <= toIso && countsInBalance(balance, "sales", d) && !((groups.get(c.externalId!)?.net ?? 0) > 0);
  });
  if (stale.length) await db.update(transactions).set({ deletedAt: now }).where(inArray(transactions.id, stale.map((t) => t.id)));

  const byDay = new Map<string, { net: number }>();
  for (const g of groups.values()) byDay.set(g.date, { net: (byDay.get(g.date)?.net ?? 0) + g.net });
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
    // Recebimentos do CH: mesma regra das pagas; com vendas do dia no saldo, ficam sempre fora (a venda já contou).
    sql`((${transactions.externalId} like 'pagar:%' and ${outside(rules.paid)}) or (${transactions.externalId} like 'receber:%' and (${outside(rules.paid)} or ${rules.sales})) or (${transactions.externalId} like 'vendas:%' and ${outside(rules.sales)}))`,
  );
}
