import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, budgets, categories, transactions } from "@/db/schema";

/** Lançamentos da área Pessoal com vencimento entre from e to (pagos ou não), com categoria e, se houver, a empresa que pagou. */
export async function personalRows(personalId: number, from: string, to: string) {
  const src = sql`(select e.nome from contas c join empresas e on e.id = c.empresa_id where c.id = ${transactions.withdrawalAccountId})`;
  const srcColor = sql`(select e.cor from contas c join empresas e on e.id = c.empresa_id where c.id = ${transactions.withdrawalAccountId})`;
  return db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      dueDate: transactions.dueDate,
      paidAt: transactions.paidAt,
      description: transactions.description,
      counterpart: transactions.counterpart,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      withdrawalAccountId: transactions.withdrawalAccountId,
      sourceCompany: sql<string | null>`${src}`,
      sourceColor: sql<string | null>`${srcColor}`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.companyId, personalId),
        isNull(transactions.deletedAt),
        eq(transactions.offBalance, false),
        sql`${transactions.dueDate} between ${from} and ${to}`,
      ),
    )
    .orderBy(asc(transactions.dueDate), asc(transactions.id));
}


export async function personalBudgets(personalId: number) {
  return db
    .select({ categoryId: budgets.categoryId, amount: budgets.amount })
    .from(budgets)
    .where(eq(budgets.companyId, personalId));
}

export async function personalCategories(personalId: number) {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.companyId, personalId), eq(categories.type, "saida")))
    .orderBy(asc(categories.name));
}

/** Saldo das contas pessoais de verdade (sem a conta técnica "Pago pelas empresas"). */
export async function personalAccountIds(personalId: number) {
  const rows = await db
    .select({ id: accounts.id, via: accounts.viaCompany })
    .from(accounts)
    .where(eq(accounts.companyId, personalId));
  return { real: rows.filter((r) => !r.via).map((r) => r.id), via: rows.find((r) => r.via)?.id ?? null };
}

