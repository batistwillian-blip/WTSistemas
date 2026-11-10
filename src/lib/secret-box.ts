// Cifra segredos guardados no banco (ex.: token do CHServer) com AES-256-GCM.
// A chave vem de ENCRYPTION_KEY; sem ela, é derivada do DATABASE_URL, que não fica guardado no banco.
// Assim, uma cópia do banco sozinha não revela o token.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key(env: NodeJS.ProcessEnv = process.env): Buffer {
  const base = env.ENCRYPTION_KEY || env.DATABASE_URL;
  if (!base) throw new Error("Sem ENCRYPTION_KEY nem DATABASE_URL para cifrar segredos.");
  return createHash("sha256").update("caixa-consolidado:segredos:" + base).digest();
}

export function encryptSecret(plain: string, env?: NodeJS.ProcessEnv): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(env), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(box: string, env?: NodeJS.ProcessEnv): string {
  const [v, iv, tag, data] = box.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", key(env), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
