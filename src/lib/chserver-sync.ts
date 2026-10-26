// Sincronização dos títulos de Receber e Pagar do CHServer para os lançamentos da empresa configurada.
// Usado pela importação automática, pelo botão do administrador, pela rota agendada e pelo script.
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, auditLog, companies, integrationRuns, integrationSettings, transactions } from "@/db/schema";
import { chGet, mapTitle, readChConfig, toChDate, type ChConfig, type ChTitle } from "./chserver";
import { addDays, today } from "./format";
import { decryptSecret } from "./secret-box";

export type SyncResult = { ok: boolean; message: string; created: number; updated: number };
export type ChSettings = {
  cfg: ChConfig;
  companyId: number;
  accountId: number;
  origin: "tela" | "variaveis";
  kinds: ("Receber" | "Pagar")[];
};

// Janela de vencimentos lida a cada importação. Títulos antigos em aberto também são atualizados.
const PAST_DAYS = 365;
const FUTURE_DAYS = 180;

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
      kinds: [...(row.importReceivables ? (["Receber"] as const) : []), ...(row.importPayables ? (["Pagar"] as const) : [])],
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
  return { cfg, companyId: company.id, accountId: account.id, origin: "variaveis", kinds: ["Receber", "Pagar"] };
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
    if (kinds.length === 0) return finish({ ok: false, message: "Nenhum tipo de título marcado para importar.", created: 0, updated: 0 });

    const fromIso = addDays(today(), -PAST_DAYS);
    const toIso = addDays(today(), FUTURE_DAYS);
    const titles: ChTitle[] = [];
    for (const kind of kinds) {
      const records = await chGet(cfg, kind, [toChDate(fromIso), toChDate(toIso)]);
      for (const r of records) {
        const t = mapTitle(kind, r);
        if (t) titles.push(t);
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
            deletedAt: null,
            updatedAt: new Date(),
          },
          // Só regrava se algo mudou (inclusive título que tinha sumido e voltou), para o contador refletir alterações reais.
          setWhere: sql`(${transactions.amount}, ${transactions.dueDate}, ${transactions.paidAt}, ${transactions.description}, ${transactions.deletedAt} is null)
            is distinct from (excluded.valor, excluded.vencimento, excluded.pago_em, excluded.descricao, true)`,
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
    const gone = existing.filter((e) => e.externalId && prefixes.some((p) => e.externalId!.startsWith(p)) && !seen.has(e.externalId));
    // Proteção: se a resposta veio vazia ou cortada, não apaga em massa; só avisa.
    const suspicious = gone.length > 20 && gone.length > existing.length / 2;
    if (gone.length && !suspicious) {
      await db
        .update(transactions)
        .set({ deletedAt: new Date() })
        .where(inArray(transactions.id, gone.map((g) => g.id)));
    }
    const removed = suspicious ? 0 : gone.length;
    const warning = suspicious ? ` Atenção: ${gone.length} títulos não vieram nesta leitura; por segurança nada foi removido.` : "";

    const message = `${titles.length} títulos lidos (${kinds.join(" e ")}): ${created} novos, ${updated} atualizados${removed ? `, ${removed} removidos por não existirem mais no CHServer` : ""}.${warning}`;
    await db.insert(auditLog).values({
      userId: triggeredBy?.id ?? null,
      userName: triggeredBy?.name ?? "Importação automática",
      companyId,
      action: "sincronizar",
      entity: "integracao_chserver",
      after: { created, updated, removidos: removed, lidos: titles.length, tipos: kinds },
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
