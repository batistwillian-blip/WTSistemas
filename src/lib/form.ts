import { isValidIsoDate, parseMoney } from "./format";

export type ActionState = { error?: string; ok?: string } | undefined;

export function str(fd: FormData, key: string, max = 300): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function optStr(fd: FormData, key: string, max = 300): string | null {
  return str(fd, key, max) || null;
}

export function int(fd: FormData, key: string): number | null {
  const v = str(fd, key, 20);
  if (!/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}

export function money(fd: FormData, key: string): number | null {
  return parseMoney(str(fd, key, 30));
}

export function isoDate(fd: FormData, key: string): string | null {
  const v = str(fd, key, 10);
  return isValidIsoDate(v) ? v : null;
}

export class UserError extends Error {}

/** Executa a ação e converte erros esperados em mensagem para o formulário. */
export async function guard(fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof Error && e.message.startsWith("Sem permissão")) return { error: e.message };
    throw e;
  }
}
