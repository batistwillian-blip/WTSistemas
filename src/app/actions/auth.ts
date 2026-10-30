"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recoveryCodes, users } from "@/db/schema";
import { attemptLogin, endAllSessions, endSession, registerFailedAttempt, requireUser, startSession } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { guard, str, UserError, type ActionState } from "@/lib/form";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { hashRecoveryCode, newRecoveryCode, RECOVERY_CODE_COUNT } from "@/lib/recovery";

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

export type CodesState = { error?: string; ok?: string; codes?: string[] } | undefined;

/** Gera novos códigos de recuperação (os antigos não usados deixam de valer). Pede a senha atual. */
export async function generateRecoveryCodes(_prev: CodesState, fd: FormData): Promise<CodesState> {
  const user = await requireUser();
  const current = (fd.get("current") as string | null) ?? "";
  if (!(await verifyPassword(user.passwordHash, current))) return { error: "Senha atual incorreta." };
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await db.transaction(async (tx) => {
    await tx.delete(recoveryCodes).where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)));
    await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId: user.id, codeHash: hashRecoveryCode(c) })));
  });
  await logChange({ user, action: "gerar_codigos_recuperacao", entity: "usuario", entityId: user.id, after: { quantidade: codes.length } });
  return { ok: "Códigos gerados. Guarde em lugar seguro: eles não aparecem de novo.", codes };
}

/** "Esqueci minha senha": e-mail + um código de recuperação (uso único) + nova senha. */
export async function recoverPassword(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const email = str(fd, "email", 200).toLowerCase();
    const code = str(fd, "code", 40);
    const next = (fd.get("next") as string | null) ?? "";
    const confirm = (fd.get("confirm") as string | null) ?? "";
    const problem = passwordProblem(next);
    if (problem) throw new UserError(problem);
    if (next !== confirm) throw new UserError("A confirmação não confere com a nova senha.");
    const generic = "E-mail ou código de recuperação incorretos.";
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user || !user.active) {
      await logChange({ user: null, action: "recuperar_senha_falhou", entity: "usuario", after: { email } });
      throw new UserError(generic);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UserError("Acesso bloqueado temporariamente por excesso de tentativas. Tente de novo em alguns minutos.");
    }
    const [match] = await db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.userId, user.id), eq(recoveryCodes.codeHash, hashRecoveryCode(code)), isNull(recoveryCodes.usedAt)));
    if (!match) {
      // Conta como tentativa errada, igual ao login: 5 erros bloqueiam por 15 minutos.
      await registerFailedAttempt(user);
      await logChange({ user: null, action: "recuperar_senha_falhou", entity: "usuario", entityId: user.id, after: { email } });
      throw new UserError(generic);
    }
    // Marca o código como usado só se ninguém usou antes (evita usar o mesmo código duas vezes ao mesmo tempo).
    const used = await db
      .update(recoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(recoveryCodes.id, match.id), isNull(recoveryCodes.usedAt)))
      .returning({ id: recoveryCodes.id });
    if (!used.length) throw new UserError(generic);
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(next), mustChangePassword: false, failedAttempts: 0, lockedUntil: null })
      .where(eq(users.id, user.id));
    await endAllSessions(user.id);
    await startSession(user.id);
    await logChange({ user, action: "recuperar_senha", entity: "usuario", entityId: user.id });
    redirect("/");
  });
}
