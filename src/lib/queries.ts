import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, companies, transactions, transfers } from "@/db/schema";
import { today } from "./format";

const notDeleted = isNull(transactions.deletedAt);
const signedAmount = sql<number>`case when ${transactions.type} = 'entrada' then ${transactions.amount} else -${transactions.amount} end`;

export async function getAccounts(companyIds: number[], onlyActive = false) {
  if (companyIds.length === 0) return [];
  return db
    .select()
    .from(accounts)
    .where(and(inArray(accounts.companyId, companyIds), onlyActive ? eq(accounts.active, true) : undefined))
    .orderBy(asc(accounts.companyId), asc(accounts.name));
}

export async function getCategories(companyId: number) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.companyId, companyId))
    .orderBy(asc(categories.type), asc(categories.name));
}

/** Saldo realizado por conta até a data (inclusive): saldo inicial + lançamentos pagos. */
export async function accountBalances(companyIds: number[], until = today()) {
  if (companyIds.length === 0) return [];
  const rows = await db
    .select({
      id: accounts.id,
      companyId: accounts.companyId,
      name: accounts.name,
      kind: accounts.kind,
      active: accounts.active,
      balance: sql<string>`${accounts.initialBalance} + coalesce(sum(${signedAmount}) filter (where ${transactions.paidAt} is not null and ${transactions.paidAt} <= ${until} and ${transactions.deletedAt} is null), 0)`,
    })
    .from(accounts)
    .leftJoin(transactions, eq(transactions.accountId, accounts.id))
    .where(inArray(accounts.companyId, companyIds))
    .groupBy(accounts.id)
    .orderBy(asc(accounts.companyId), asc(accounts.name));
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

export async function pendingItems(companyIds: number[], untilDue?: string) {
  if (companyIds.length === 0) return [];
  return db
    .select({
      id: transactions.id,
      companyId: transactions.companyId,
      type: transactions.type,
      amount: transactions.amount,
      dueDate: transactions.dueDate,
      description: transactions.description,
      counterpart: transactions.counterpart,
      transferId: transactions.transferId,
      source: transactions.source,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.companyId, companyIds),
        isNull(transactions.paidAt),
        notDeleted,
        untilDue ? lte(transactions.dueDate, untilDue) : undefined,
      ),
    )
    .orderBy(asc(transactions.dueDate), asc(transactions.id));
}

/** Entradas e saídas realizadas no período, sem contar transferências entre empresas. */
export async function realizedTotals(companyIds: number[], from: string, to: string) {
  if (companyIds.length === 0) return { inflow: 0, outflow: 0 };
  const [row] = await db
    .select({
      inflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'entrada'), 0)`,
      outflow: sql<string>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'saida'), 0)`,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.companyId, companyIds),
        notDeleted,
        isNotNull(transactions.paidAt),
        isNull(transactions.transferId),
        gte(transactions.paidAt, from),
        lte(transactions.paidAt, to),
      ),
    );
  return { inflow: Number(row.inflow), outflow: Number(row.outflow) };
}

export type TxFilters = {
  from: string;
  to: string;
  type?: "entrada" | "saida";
  status?: "pago" | "pendente";
  q?: string;
  accountId?: number;
};

export async function listTransactions(companyId: number, f: TxFilters) {
  const q = f.q?.trim();
  // Pendentes filtram pelo vencimento; pagos pela data do pagamento.
  const dateCond = or(
    and(isNull(transactions.paidAt), gte(transactions.dueDate, f.from), lte(transactions.dueDate, f.to)),
    and(isNotNull(transactions.paidAt), gte(transactions.paidAt, f.from), lte(transactions.paidAt, f.to)),
  );
  return db
    .select({
      tx: transactions,
      accountName: accounts.name,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.companyId, companyId),
        notDeleted,
        dateCond,
        f.type ? eq(transactions.type, f.type) : undefined,
        f.status === "pago" ? isNotNull(transactions.paidAt) : undefined,
        f.status === "pendente" ? isNull(transactions.paidAt) : undefined,
        f.accountId ? eq(transactions.accountId, f.accountId) : undefined,
        q
          ? or(
              ilike(transactions.description, `%${escapeLike(q)}%`),
              ilike(transactions.counterpart, `%${escapeLike(q)}%`),
            )
          : undefined,
      ),
    )
    .orderBy(desc(sql`coalesce(${transactions.paidAt}, ${transactions.dueDate})`), desc(transactions.id))
    .limit(500);
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function getTransaction(id: number) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), notDeleted));
  return row ?? null;
}

export async function listTransfers(companyIds: number[]) {
  if (companyIds.length === 0) return [];
  return db
    .select()
    .from(transfers)
    .where(
      and(
        isNull(transfers.deletedAt),
        or(inArray(transfers.fromCompanyId, companyIds), inArray(transfers.toCompanyId, companyIds)),
      ),
    )
    .orderBy(desc(transfers.date), desc(transfers.createdAt));
}

export async function allCompanies() {
  return db.select().from(companies).orderBy(asc(companies.sortOrder), asc(companies.name));
}
