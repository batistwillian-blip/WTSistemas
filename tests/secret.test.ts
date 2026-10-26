import { describe, expect, it } from "vitest";
import { normalizeBaseUrl, validateChConfig } from "@/lib/chserver";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

const env = { DATABASE_URL: "postgres://u:p@h/db" } as unknown as NodeJS.ProcessEnv;

describe("cifra de segredos", () => {
  it("cifra e decifra, sem deixar o texto aparente", () => {
    const box = encryptSecret("meu-token-123", env);
    expect(box).not.toContain("meu-token");
    expect(decryptSecret(box, env)).toBe("meu-token-123");
  });
  it("não decifra com outra chave", () => {
    const box = encryptSecret("x", env);
    expect(() => decryptSecret(box, { ENCRYPTION_KEY: "outra" } as unknown as NodeJS.ProcessEnv)).toThrow();
  });
});

describe("endereço do CHServer", () => {
  it("aceita formas comuns de digitar", () => {
    expect(normalizeBaseUrl("cloud.exemplo.com.br:8080")).toBe("http://cloud.exemplo.com.br:8080");
    expect(normalizeBaseUrl("http://cloud.exemplo.com.br:8080/datasnap/rest/TCHAPI/")).toBe("http://cloud.exemplo.com.br:8080");
    expect(normalizeBaseUrl(" https://x:9000/ ")).toBe("https://x:9000");
  });
  it("valida os campos", () => {
    const ok = validateChConfig({ baseUrl: "x:8080", cnpj: "11.222.333/0001-81", companyKey: "1", token: "abc" });
    expect(ok.cnpj).toBe("11222333000181");
    expect(() => validateChConfig({ baseUrl: "x:8080", cnpj: "123", companyKey: "1", token: "abc" })).toThrow("CNPJ");
    expect(() => validateChConfig({ baseUrl: "x:8080/outra/coisa", cnpj: "11222333000181", companyKey: "1", token: "abc" })).toThrow("Endereço");
  });
});
