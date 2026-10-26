import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type User } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_COOKIE = "caixa_sessao";
const SESSION_HOURS = 12;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

export async function clientInfo() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

// Hash usado quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails são válidos.
let dummyHash: Promise<string> | null = null;

export type LoginResult = { ok: true; user: User } | { ok: false; error: string };

export async function attemptLogin(email: string, password: string): Promise<LoginResult> {
  const generic = { ok: false as const, error: "E-mail ou senha incorretos." };
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user || !user.active) {
    dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
    await verifyPassword(await dummyHash, password);
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Acesso bloqueado temporariamente por excesso de tentativas. Tente de novo em alguns minutos." };
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const attempts = user.failedAttempts + 1;
    await db
      .update(users)
      .set({
        failedAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
        lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, user.id));
    return generic;
  }
  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));
  return { ok: true, user };
}

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000);
  const { ip, userAgent } = await clientInfo();
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt, ip, userAgent });
  // Limpeza oportunista de sessões vencidas.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

/** Encerra todas as sessões do usuário (ex.: após troca de senha ou desativação). */
export async function endAllSessions(userId: number) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())));
  if (!row || !row.user.active) return null;
  return row.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
