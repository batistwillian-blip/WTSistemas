// Sincronização dos títulos de Receber e Pagar do CHServer para os lançamentos da empresa configurada.
// Usado pela rota agendada, pelo botão do administrador e pelo script de linha de comando.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, auditLog, companies, integrationRuns, transactions } from "@/db/schema";
import { chGet, mapTitle, readChConfig, toChDate, type ChTitle } from "./chserver";
import { addDays, today } from "./format";

export type SyncResult = { ok: boolean; message: string; created: number; updated: number };

export async function syncChServer(triggeredBy: { id: number; name: string } | null = null): Promise<SyncResult> {
  const [run] = await db.insert(integrationRuns).values({ source: "chserver" }).returning();
  const finish = async (r: SyncResult) => {
    await db
      .update(integrationRuns)
      .set({ finishedAt: new Date(), ok: r.ok, message: r.message, created: r.created, updated: r.updated })
      .where(eq(integrationRuns.id, run.id));
    return r;
  };
  try {
    const cfg = readChConfig();
    if (!cfg) return finish({ ok: false, message: "Integração não configurada (variáveis CHSERVER_*).", created: 0, updated: 0 });

    const slug = process.env.CHSERVER_EMPRESA_SLUG || "primetech-loja";
    const [company] = await db.select().from(companies).where(eq(companies.slug, slug));
    if (!company) return finish({ ok: false, message: `Empresa ${slug} não encontrada.`, created: 0, updated: 0 });
    const accountName = process.env.CHSERVER_CONTA_NOME || "Banco";
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.companyId, company.id), eq(accounts.name, accountName)));
    if (!account) return finish({ ok: false, message: `Conta "${accountName}" não encontrada em ${company.name}.`, created: 0, updated: 0 });

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
        .values({ ...t, companyId: company.id, accountId: account.id, source: "chserver" })
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
      userName: triggeredBy?.name ?? "Sincronização automática",
      companyId: company.id,
      action: "sincronizar",
      entity: "integracao_chserver",
      after: { created, updated, lidos: titles.length },
    });
    return finish({ ok: true, message, created, updated });
  } catch (e) {
    // A mensagem nunca inclui o token: chGet só lança textos fixos ou o status HTTP.
    const message = e instanceof Error ? e.message.slice(0, 300) : "Erro desconhecido.";
    return finish({ ok: false, message, created: 0, updated: 0 });
  }
}
