import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyAccess, type Company, type Role, type User } from "@/db/schema";
import { requireUser } from "./auth";
import { roleAllows, type Permission } from "./roles";

export type CompanyWithRole = Company & { role: Role };

/** Empresas que o usuário pode ver, com o papel dele em cada uma. Administrador vê todas como gestor. */
export const getUserCompanies = cache(async (user: User): Promise<CompanyWithRole[]> => {
  if (user.isAdmin) {
    // A área Pessoal de cada um não é empresa: fica fora desta lista (e do consolidado), até para administradores.
    const all = await db.select().from(companies).where(isNull(companies.ownerId)).orderBy(asc(companies.sortOrder), asc(companies.name));
    return all.map((c) => ({ ...c, role: "gestor" as const }));
  }
  const rows = await db
    .select({ company: companies, role: companyAccess.role })
    .from(companyAccess)
    .innerJoin(companies, eq(companies.id, companyAccess.companyId))
    .where(and(eq(companyAccess.userId, user.id), isNull(companies.ownerId)))
    .orderBy(asc(companies.sortOrder), asc(companies.name));
  return rows.map((r) => ({ ...r.company, role: r.role }));
});

/** Área Pessoal do usuário (só ele vê), se já foi ativada. */
export const getPersonal = cache(async (user: User): Promise<CompanyWithRole | null> => {
  const [row] = await db.select().from(companies).where(eq(companies.ownerId, user.id)).limit(1);
  return row ? { ...row, role: "gestor" as const } : null;
});

/** Empresas + a área Pessoal do próprio usuário: o que as telas e ações por empresa aceitam. */
async function reachable(user: User) {
  const [list, personal] = await Promise.all([getUserCompanies(user), getPersonal(user)]);
  return personal ? [...list, personal] : list;
}

export async function requireCompany(slug: string, perm: Permission = "ver") {
  const user = await requireUser();
  const list = await reachable(user);
  const company = list.find((c) => c.slug === slug);
  // Sem acesso (ou sem o nível exigido) responde como página inexistente, para não revelar o que existe.
  if (!company || !roleAllows(company.role, perm)) notFound();
  return { user, company, role: company.role };
}

/** Versão por id, usada nas ações do servidor. */
export async function requireCompanyId(companyId: number, perm: Permission) {
  const user = await requireUser();
  const list = await reachable(user);
  const company = list.find((c) => c.id === companyId);
  if (!company || !roleAllows(company.role, perm)) throw new Error("Sem permissão para esta ação nesta empresa.");
  return { user, company };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
