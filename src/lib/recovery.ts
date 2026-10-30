import { createHash, randomInt } from "node:crypto";

// Sem letras e números que se confundem (0/O, 1/I/L).
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const RECOVERY_CODE_COUNT = 8;

/** Código no formato XXXX-XXXX-XXXX (~59 bits de aleatoriedade). */
export function newRecoveryCode(): string {
  let s = "";
  for (let i = 0; i < 12; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

/** Normaliza o que a pessoa digitou (minúsculas, espaços, sem traços) antes de comparar. */
export function normalizeRecoveryCode(input: string): string {
  const s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 12 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : s;
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
