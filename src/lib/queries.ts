import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, companies, sales, transactions, transfers } from "@/db/schema";
import { today } from "./format";

// Lançamentos "fora do saldo" (pagos importados do CH só para consulta) não aparecem em saldo, totais nem listas de lançamentos.
const notDeleted = and(isNull(transactions.deletedAt), eq(transactions.offBalance, false));
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
      balance: sql<string>`${accounts.initialBalance} + coalesce(sum(${signedAmount}) filter (where ${transactions.paidAt} is not null and ${transactions.paidAt} <= ${until} and ${transactions.deletedAt} is null and not ${transactions.offBalance}), 0)`,
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
      accountId: transactions.accountId,
      originalAmount: transactions.originalAmount,
      installment: transactions.installment,
      installments: transactions.installments,
      document: transactions.document,
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
              ilike(transactions.document, `%${escapeLike(q)}%`),
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

/**
 * Contas a pagar ou a receber num intervalo, pela data escolhida (vencimento, pagamento ou competência), pagas ou não.
 * Inclui as pagas do CH só para consulta (marcadas), sem "Vendas do dia" e, no consolidado, sem transferências.
 */
export async function billsInRange(
  companyIds: number[],
  type: "entrada" | "saida",
  base: "vencimento" | "pagamento" | "competencia",
  from: string,
  to: string,
  excludeTransfers: boolean,
) {
  if (companyIds.length === 0) return [];
  const col =
    base === "pagamento"
      ? transactions.paidAt
      : base === "competencia"
        ? sql`coalesce(${transactions.competence}, date_trunc('month', ${transactions.dueDate})::date)`
        : transactions.dueDate;
  return db
    .select({
      id: transactions.id,
      companyId: transactions.companyId,
      type: transactions.type,
      description: transactions.description,
      counterpart: transactions.counterpart,
      amount: transactions.amount,
      dueDate: transactions.dueDate,
      paidAt: transactions.paidAt,
      competence: transactions.competence,
      source: transactions.source,
      offBalance: transactions.offBalance,
      accountId: transactions.accountId,
      accountName: accounts.name,
      categoryName: categories.name,
      externalCategory: transactions.externalCategory,
      interest: transactions.interest,
      discount: transactions.discount,
      originalAmount: transactions.originalAmount,
      partialOf: transactions.partialOf,
      transferId: transactions.transferId,
      installment: transactions.installment,
      installments: transactions.installments,
      document: transactions.document,
      parentPaid: sql<boolean>`exists (select 1 from lancamentos o where o.id = ${transactions.partialOf} and o.pago_em is not null and o.excluido_em is null)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        inArray(transactions.companyId, companyIds),
        isNull(transactions.deletedAt),
        eq(transactions.type, type),
        sql`${col} between ${from} and ${to}`,
        sql`coalesce(${transactions.externalId}, '') not like 'vendas:%'`,
        excludeTransfers ? isNull(transactions.transferId) : undefined,
      ),
    )
    .orderBy(asc(transactions.dueDate), asc(transactions.id));
}

/** Contas já pagas/recebidas no período (pela data do pagamento), inclusive as importadas do CH só para consulta. */
export async function paidBills(companyIds: number[], type: "entrada" | "saida", from: string, to: string, excludeTransfers: boolean) {
  if (companyIds.length === 0) return [];
  return db
    .select({
      id: transactions.id,
      companyId: transactions.companyId,
      description: transactions.description,
      counterpart: transactions.counterpart,
      amount: transactions.amount,
      dueDate: transactions.dueDate,
      paidAt: transactions.paidAt,
      source: transactions.source,
      offBalance: transactions.offBalance,
      accountName: accounts.name,
      interest: transactions.interest,
      discount: transactions.discount,
      partialOf: transactions.partialOf,
      transferId: transactions.transferId,
      installment: transactions.installment,
      installments: transactions.installments,
      document: transactions.document,
      // Parcial cuja conta de origem já foi quitada: estorna-se primeiro o pagamento final.
      parentPaid: sql<boolean>`exists (select 1 from lancamentos o where o.id = ${transactions.partialOf} and o.pago_em is not null and o.excluido_em is null)`,
    })
    .from(transactions)
    .innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        inArray(transactions.companyId, companyIds),
        isNull(transactions.deletedAt),
        eq(transactions.type, type),
        isNotNull(transactions.paidAt),
        gte(transactions.paidAt, from),
        lte(transactions.paidAt, to),
        // "Vendas do dia" não é conta a receber: fica na tela de vendas.
        sql`coalesce(${transactions.externalId}, '') not like 'vendas:%'`,
        excludeTransfers ? isNull(transactions.transferId) : undefined,
      ),
    )
    .orderBy(desc(transactions.paidAt), desc(transactions.id))
    .limit(1000);
}

/** Entradas e saídas realizadas por mês (AAAA-MM), sem transferências entre empresas. */
export async function monthlyTotals(companyIds: number[], from: string, to: string) {
  if (companyIds.length === 0) return [];
  const rows = await db
    .select({
      month: sql<string>`to_char(${transactions.paidAt}, 'YYYY-MM')`,
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
    )
    .groupBy(sql`1`);
  return rows.map((r) => ({ month: r.month, inflow: Number(r.inflow), outflow: Number(r.outflow) }));
}

/** Totais realizados por categoria (do caixa ou do CH) no período, sem transferências entre empresas. */
export async function categoryTotals(companyIds: number[], from: string, to: string) {
  if (companyIds.length === 0) return [];
  const name = sql<string>`coalesce(${categories.name}, ${transactions.externalCategory}, 'Sem categoria')`;
  const rows = await db
    .select({ type: transactions.type, name, total: sql<string>`sum(${transactions.amount})`, n: sql<number>`count(*)::int` })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        inArray(transactions.companyId, companyIds),
        notDeleted,
        isNotNull(transactions.paidAt),
        isNull(transactions.transferId),
        gte(transactions.paidAt, from),
        lte(transactions.paidAt, to),
      ),
    )
    .groupBy(transactions.type, name)
    .orderBy(desc(sql`sum(${transactions.amount})`));
  return rows.map((r) => ({ type: r.type, name: r.name, total: Number(r.total), n: r.n }));
}

/** Contas pagas no CH guardadas só para consulta (fora do saldo), por categoria, no período do pagamento. */
export async function consultationTotals(companyIds: number[], from: string, to: string) {
  if (companyIds.length === 0) return [];
  const name = sql<string>`coalesce(${transactions.externalCategory}, 'Sem categoria')`;
  const rows = await db
    .select({ name, total: sql<string>`sum(${transactions.amount})`, n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        inArray(transactions.companyId, companyIds),
        isNull(transactions.deletedAt),
        eq(transactions.offBalance, true),
        eq(transactions.type, "saida"),
        gte(transactions.paidAt, from),
        lte(transactions.paidAt, to),
      ),
    )
    .groupBy(name)
    .orderBy(desc(sql`sum(${transactions.amount})`));
  return rows.map((r) => ({ name: r.name, total: Number(r.total), n: r.n }));
}

/** Vendas líquidas (notas do CH, sem canceladas e devoluções) no período, só para indicadores. */
export async function salesTotal(companyIds: number[], from: string, to: string) {
  if (companyIds.length === 0) return { net: 0, notes: 0 };
  const [r] = await db
    .select({
      net: sql<string>`coalesce(sum(case when ${sales.canceled} then 0 else greatest(${sales.total} - ${sales.returned}, 0) end), 0)`,
      notes: sql<number>`(count(*) filter (where not ${sales.canceled}))::int`,
    })
    .from(sales)
    .where(and(inArray(sales.companyId, companyIds), isNull(sales.deletedAt), gte(sales.date, from), lte(sales.date, to)));
  return { net: Number(r.net), notes: r.notes };
}
