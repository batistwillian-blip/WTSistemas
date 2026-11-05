import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, companies, transactions, users } from "@/db/schema";
import type { User } from "@/db/schema";
import { getUserCompanies } from "./access";
import { logChange } from "./audit";
import { roleAllows } from "./roles";

export const WITHDRAWAL_CATEGORY = "Retirada do sócio";

/** Categoria "Retirada do sócio" da empresa (cria se não existir). */
async function withdrawalCategory(companyId: number): Promise<number> {
  const [found] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.type, "saida"), eq(categories.withdrawal, true)))
    .limit(1);
  if (found) return found.id;
  const [created] = await db.insert(categories).values({ companyId, name: WITHDRAWAL_CATEGORY, type: "saida", withdrawal: true }).returning({ id: categories.id });
  return created.id;
}

/**
 * Mantém a "Retirada do sócio" de cada empresa igual aos lançamentos pessoais pagos com dinheiro dela.
 * Lançamento pessoal com conta de empresa → uma saída espelho naquela empresa (mesmo valor, vencimento, pagamento).
 * Sem conta de empresa, excluído ou virou pagamento parcial → o espelho é excluído.
 * Na empresa a descrição é só "Retirada do sócio (nome)": o detalhe do gasto pessoal fica só na área Pessoal.
 */
export async function syncWithdrawals(personalIds: number[], user: { id: number; name: string } | null) {
  if (personalIds.length === 0) return;
  const rows = await db
    .select({ tx: transactions, ownerId: companies.ownerId, ownerName: users.name })
    .from(transactions)
    .innerJoin(companies, eq(companies.id, transactions.companyId))
    .leftJoin(users, eq(users.id, companies.ownerId))
    .where(inArray(transactions.id, personalIds));
  const mirrors = await db.select().from(transactions).where(inArray(transactions.personalOf, personalIds));
  const mirrorOf = new Map(mirrors.map((m) => [m.personalOf!, m]));
  const accIds = [...new Set(rows.map((r) => r.tx.withdrawalAccountId).filter((v): v is number => v !== null))];
  const accs = accIds.length ? await db.select().from(accounts).where(inArray(accounts.id, accIds)) : [];
  const accById = new Map(accs.map((a) => [a.id, a]));
  const catOf = new Map<number, number>();
  const created: number[] = [];
  const removed: number[] = [];
  for (const { tx: p, ownerId, ownerName } of rows) {
    if (!ownerId) continue; // só lançamentos da área Pessoal
    const mirror = mirrorOf.get(p.id);
    const acc = p.withdrawalAccountId ? accById.get(p.withdrawalAccountId) : undefined;
    const want = acc && !p.deletedAt && !p.partialOf;
    if (!want) {
      if (mirror && !mirror.deletedAt) {
        await db.update(transactions).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(transactions.id, mirror.id));
        removed.push(mirror.id);
      }
      continue;
    }
    if (!catOf.has(acc.companyId)) catOf.set(acc.companyId, await withdrawalCategory(acc.companyId));
    const values = {
      companyId: acc.companyId,
      accountId: acc.id,
      type: "saida" as const,
      description: `${WITHDRAWAL_CATEGORY} (${ownerName ?? "sócio"})`,
      categoryId: catOf.get(acc.companyId)!,
      counterpart: ownerName ?? null,
      amount: p.amount,
      dueDate: p.dueDate,
      competence: p.competence,
      paidAt: p.paidAt,
      source: "pessoal" as const,
      personalOf: p.id,
      deletedAt: null,
      updatedAt: new Date(),
    };
    if (mirror) {
      await db.update(transactions).set(values).where(eq(transactions.id, mirror.id));
    } else {
      const [m] = await db
        .insert(transactions)
        .values({ ...values, createdBy: user?.id ?? p.createdBy })
        .returning({ id: transactions.id });
      created.push(m.id);
    }
  }
  if (created.length || removed.length) {
    await logChange({
      user,
      companyId: null,
      action: "retirada_socio",
      entity: "lancamento",
      entityId: [...created, ...removed].join(","),
      after: { criadas: created.length, excluidas: removed.length },
    });
  }
}

/** Contas das empresas de onde o dono da área Pessoal pode tirar dinheiro (onde ele lança). */
export async function withdrawalSources(companyList: { id: number; name: string; color: string }[]) {
  if (companyList.length === 0) return [];
  const accs = await db
    .select()
    .from(accounts)
    .where(and(inArray(accounts.companyId, companyList.map((c) => c.id)), eq(accounts.active, true), eq(accounts.viaCompany, false)));
  const byId = new Map(companyList.map((c) => [c.id, c]));
  return accs
    .map((a) => ({ id: a.id, name: a.name, companyId: a.companyId, companyName: byId.get(a.companyId)!.name }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));
}


/** Opções do formulário de lançamento na área Pessoal (nada para empresas). */
export async function personalFormOptions(user: User, company: { id: number; ownerId: number | null }) {
  if (!company.ownerId) return undefined;
  const [via] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.companyId, company.id), eq(accounts.viaCompany, true)));
  if (!via) return undefined;
  const list = (await getUserCompanies(user)).filter((c) => roleAllows(c.role, "lancar"));
  return { viaAccountId: via.id, sources: await withdrawalSources(list) };
}
