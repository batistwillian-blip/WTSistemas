import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { getUserCompanies } from "./access";
import { requireUser } from "./auth";
import { roleAllows } from "./roles";

export type LenderAccount = { id: number; name: string; companyId: number; company: string };

/** Contas ativas das empresas em que a pessoa lança: de onde dá para pagar a conta de outra empresa (vira empréstimo). */
export async function lenderAccounts(): Promise<LenderAccount[]> {
  const user = await requireUser();
  const list = (await getUserCompanies(user)).filter((c) => roleAllows(c.role, "lancar"));
  if (list.length < 2) return [];
  const names = new Map(list.map((c) => [c.id, c.name]));
  const rows = await db
    .select({ id: accounts.id, name: accounts.name, companyId: accounts.companyId })
    .from(accounts)
    .where(and(inArray(accounts.companyId, list.map((c) => c.id)), eq(accounts.active, true), eq(accounts.viaCompany, false)));
  return rows.map((r) => ({ ...r, company: names.get(r.companyId) ?? "" })).sort((a, b) => a.company.localeCompare(b.company, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
}
