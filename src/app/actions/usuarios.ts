"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyAccess, users, type Role } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { endAllSessions } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { guard, int, str, UserError, type ActionState } from "@/lib/form";
import { hashPassword, passwordProblem } from "@/lib/password";

const ROLES: Role[] = ["leitura", "lancador", "gestor"];

async function readAccess(fd: FormData) {
  const all = await db.select().from(companies);
  const list: { companyId: number; role: Role }[] = [];
  for (const c of all) {
    const role = str(fd, `role_${c.id}`) as Role;
    if (ROLES.includes(role)) list.push({ companyId: c.id, role });
  }
  return list;
}

export async function createUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const admin = await requireAdmin();
    const name = str(fd, "name", 100);
    const email = str(fd, "email", 200).toLowerCase();
    const password = (fd.get("password") as string | null) ?? "";
    if (!name) throw new UserError("Informe o nome.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("E-mail inválido.");
    const problem = passwordProblem(password);
    if (problem) throw new UserError(problem);
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) throw new UserError("Já existe um usuário com este e-mail.");
    const isAdmin = fd.get("isAdmin") === "on";
    const access = await readAccess(fd);
    await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ name, email, passwordHash: await hashPassword(password), isAdmin, mustChangePassword: true })
        .returning();
      if (access.length) await tx.insert(companyAccess).values(access.map((a) => ({ ...a, userId: u.id })));
      await logChange({ user: admin, action: "criar", entity: "usuario", entityId: u.id, after: { ...u, acessos: access } }, tx);
    });
    revalidatePath("/admin/usuarios");
    return { ok: `Usuário ${name} criado. A senha provisória terá de ser trocada no primeiro acesso.` };
  });
}

export async function updateUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const admin = await requireAdmin();
    const id = int(fd, "id");
    if (!id) throw new UserError("Usuário inválido.");
    const [before] = await db.select().from(users).where(eq(users.id, id));
    if (!before) throw new UserError("Usuário não encontrado.");
    const name = str(fd, "name", 100) || before.name;
    const active = fd.get("active") === "on";
    const isAdmin = fd.get("isAdmin") === "on";
    if (id === admin.id && (!active || !isAdmin)) throw new UserError("Você não pode remover o próprio acesso de administrador.");
    const access = await readAccess(fd);
    const beforeAccess = await db.select().from(companyAccess).where(eq(companyAccess.userId, id));
    const newPassword = (fd.get("password") as string | null) ?? "";
    if (newPassword) {
      const problem = passwordProblem(newPassword);
      if (problem) throw new UserError(problem);
    }
    await db.transaction(async (tx) => {
      const [after] = await tx
        .update(users)
        .set({
          name,
          active,
          isAdmin,
          ...(newPassword ? { passwordHash: await hashPassword(newPassword), mustChangePassword: true, failedAttempts: 0, lockedUntil: null } : {}),
        })
        .where(eq(users.id, id))
        .returning();
      await tx.delete(companyAccess).where(eq(companyAccess.userId, id));
      if (access.length) await tx.insert(companyAccess).values(access.map((a) => ({ ...a, userId: id })));
      await logChange(
        {
          user: admin,
          action: newPassword ? "editar_e_redefinir_senha" : "editar",
          entity: "usuario",
          entityId: id,
          before: { ...before, acessos: beforeAccess },
          after: { ...after, acessos: access },
        },
        tx,
      );
    });
    if (!active || newPassword) await endAllSessions(id);
    revalidatePath("/admin/usuarios");
    return { ok: "Usuário atualizado." };
  });
}
