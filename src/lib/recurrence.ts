import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { logChange } from "./audit";
import { addMonths, monthStart, today } from "./format";
import { missingMonths, OPEN_ENDED_MONTHS } from "./billing";

/**
 * Contas fixas "sem data de fim": mantém sempre os próximos meses gerados.
 * O horizonte conta também ocorrências excluídas, então um mês apagado de propósito não volta.
 * Um lock do Postgres evita que duas abas abertas gerem o mesmo mês duas vezes.
 */
export async function extendOpenEnded(companyIds: number[]) {
  if (companyIds.length === 0) return;
  const horizon = addMonths(today(), OPEN_ENDED_MONTHS - 1);
  const groups = await db
    .select({
      group: transactions.recurrenceGroup,
      first: sql<string>`min(${transactions.dueDate})`,
      last: sql<string>`max(${transactions.dueDate})`,
    })
    .from(transactions)
    .where(and(inArray(transactions.companyId, companyIds), eq(transactions.openEnded, true)))
    .groupBy(transactions.recurrenceGroup)
    .having(sql`max(${transactions.dueDate}) < ${horizon} and bool_or(${transactions.deletedAt} is null)`);
  if (groups.length === 0) return;

  await db.transaction(async (tx) => {
    const [{ locked }] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(424242) as locked`).then((r) => r.rows);
    if (!locked) return;
    for (const g of groups) {
      if (!g.group) continue;
      // Relê dentro do lock: outra requisição pode ter acabado de gerar.
      const [cur] = await tx
        .select({ last: sql<string>`max(${transactions.dueDate})` })
        .from(transactions)
        .where(eq(transactions.recurrenceGroup, g.group));
      const dates = missingMonths(g.first, cur.last, horizon);
      if (dates.length === 0) continue;
      // Modelo: a ocorrência mais recente ainda ativa (pega valor e categoria atualizados).
      const [model] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.recurrenceGroup, g.group), isNull(transactions.deletedAt), isNull(transactions.partialOf)))
        .orderBy(desc(transactions.dueDate))
        .limit(1);
      if (!model || !model.openEnded) continue;
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(transactions)
        .where(and(eq(transactions.recurrenceGroup, g.group), isNull(transactions.partialOf)));
      const created = await tx.insert(transactions).values(
        dates.map((dueDate, i) => ({
          companyId: model.companyId,
          accountId: model.accountId,
          type: model.type,
          description: model.description,
          categoryId: model.categoryId,
          counterpart: model.counterpart,
          personId: model.personId,
          amount: model.originalAmount ?? model.amount - model.interest + model.discount,
          dueDate,
          competence: monthStart(dueDate),
          installment: n + i + 1,
          document: model.document,
          notes: model.notes,
          recurrenceGroup: model.recurrenceGroup,
          recurrence: model.recurrence,
          openEnded: true,
          createdBy: model.createdBy,
        })),
      ).returning({ id: transactions.id });
      await logChange(
        { user: null, companyId: model.companyId, action: "gerar_recorrencia", entity: "lancamento", entityId: created.map((c) => c.id).join(","), after: { grupo: model.recurrenceGroup, vencimentos: dates } },
        tx,
      );
    }
  });
}
