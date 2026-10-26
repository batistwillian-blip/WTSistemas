// Sincronização dos títulos de Receber e Pagar do CHServer para os lançamentos da empresa configurada.
// Usado pela importação automática, pelo botão do administrador, pela rota agendada e pelo script.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, auditLog, companies, integrationRuns, integrationSettings, transactions } from "@/db/schema";
import { chGet, mapTitle, readChConfig, toChDate, type ChConfig, type ChTitle } from "./chserver";
import { addDays, today } from "./format";
import { decryptSecret } from "./secret-box";

export type SyncResult = { ok: boolean; message: string; created: number; updated: number };
export type ChSettings = { cfg: ChConfig; companyId: number; accountId: number; origin: "tela" | "variaveis" };

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
  return { cfg, companyId: company.id, accountId: account.id, origin: "variaveis" };
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
    const { cfg, companyId, accountId } = settings;

    const from = toChDate(addDays(today(), -60));
    const to = toChDate(addDays(today(), 120));
    const titles: ChTitle[] = [];
    for (const kind of ["Receber", "Pagar"] as const) {
      const records = await chGet(cfg, kind, [from, to]);
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
            updatedAt: new Date(),
          },
          // Só regrava se algo mudou, para o contador refletir alterações reais.
          setWhere: sql`(${transactions.amount}, ${transactions.dueDate}, ${transactions.paidAt}, ${transactions.description})
            is distinct from (excluded.valor, excluded.vencimento, excluded.pago_em, excluded.descricao)`,
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      if (!row) continue;
      if (row.inserted) created++;
      else updated++;
    }

    const message = `${titles.length} títulos lidos: ${created} novos, ${updated} atualizados.`;
    await db.insert(auditLog).values({
      userId: triggeredBy?.id ?? null,
      userName: triggeredBy?.name ?? "Importação automática",
      companyId,
      action: "sincronizar",
      entity: "integracao_chserver",
      after: { created, updated, lidos: titles.length },
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
