import "server-only";
import { db } from "@/db";
import { auditLog, type User } from "@/db/schema";
import { clientInfo } from "./auth";

type Entry = {
  user: Pick<User, "id" | "name"> | null;
  companyId?: number | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  before?: unknown;
  after?: unknown;
};

// Campos sensíveis nunca vão para o log.
const SECRET_KEYS = new Set(["passwordHash", "senha_hash", "password", "token", "tokenHash"]);

function scrub(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.map(scrub);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !SECRET_KEYS.has(k))
        .map(([k, v]) => [k, scrub(v)]),
    );
  }
  return value;
}

export async function logChange(e: Entry, tx: Pick<typeof db, "insert"> = db) {
  let ip: string | null = null;
  try {
    ip = (await clientInfo()).ip;
  } catch {
    // Fora de uma requisição (ex.: sincronização agendada) não há IP.
  }
  await tx.insert(auditLog).values({
    userId: e.user?.id ?? null,
    userName: e.user?.name ?? "Sistema",
    companyId: e.companyId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId == null ? null : String(e.entityId),
    before: scrub(e.before),
    after: scrub(e.after),
    ip,
  });
}
