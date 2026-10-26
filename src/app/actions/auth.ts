"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { attemptLogin, endAllSessions, endSession, requireUser, startSession } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { guard, str, UserError, type ActionState } from "@/lib/form";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";

export async function login(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email", 200);
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string).slice(0, 200) : "";
  if (!email || !password) return { error: "Informe e-mail e senha." };
  const result = await attemptLogin(email, password);
  if (!result.ok) {
    await logChange({ user: null, action: "login_falhou", entity: "usuario", after: { email: email.toLowerCase() } });
    return { error: result.error };
  }
  await startSession(result.user.id);
  await logChange({ user: result.user, action: "login", entity: "usuario", entityId: result.user.id });
  redirect(result.user.mustChangePassword ? "/conta?primeiro=1" : "/");
}

export async function logout() {
  await endSession();
  redirect("/login");
}

export async function changePassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const current = (fd.get("current") as string | null) ?? "";
    const next = (fd.get("next") as string | null) ?? "";
    const confirm = (fd.get("confirm") as string | null) ?? "";
    if (!(await verifyPassword(user.passwordHash, current))) throw new UserError("Senha atual incorreta.");
    const problem = passwordProblem(next);
    if (problem) throw new UserError(problem);
    if (next !== confirm) throw new UserError("A confirmação não confere com a nova senha.");
    if (next === current) throw new UserError("A nova senha precisa ser diferente da atual.");
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), mustChangePassword: false })
      .where(eq(users.id, user.id));
    // Derruba outras sessões abertas e abre uma nova neste navegador.
    await endAllSessions(user.id);
    await startSession(user.id);
    await logChange({ user, action: "trocar_senha", entity: "usuario", entityId: user.id });
    redirect("/");
  });
}
