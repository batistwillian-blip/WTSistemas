import { describe, expect, it } from "vitest";
import { hashRecoveryCode, newRecoveryCode, normalizeRecoveryCode } from "@/lib/recovery";

describe("códigos de recuperação", () => {
  it("gera no formato XXXX-XXXX-XXXX sem caracteres ambíguos", () => {
    const c = newRecoveryCode();
    expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(newRecoveryCode()).not.toBe(c);
  });
  it("aceita o código digitado de outro jeito", () => {
    expect(normalizeRecoveryCode(" abcd efgh-jkmn ")).toBe("ABCD-EFGH-JKMN");
    expect(hashRecoveryCode("abcdefghjkmn")).toBe(hashRecoveryCode("ABCD-EFGH-JKMN"));
  });
});
