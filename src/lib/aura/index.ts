import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AuraAccess, User } from "@/db/schema";
import type { Movimento } from "./move";

export { ETAPAS, parseMove, type Etapa, type Movimento } from "./move";

// Central de vendas da Aura: os dados ficam no n8n da Aura. O portal busca pelo servidor,
// com uma chave que o navegador nunca vê, e só para quem tem permissão.
const BASE = (process.env.AURA_N8N_URL || "https://n8n.aurasc.com.br/webhook").replace(/\/+$/, "");
const CHAVE = process.env.AURA_N8N_CHAVE || "";
/** Versão de teste: lê os dados de verdade, mas não grava movimentos no n8n. */
export const AURA_MODO_TESTE = process.env.AURA_MODO_TESTE === "1";

export const auraLabels: Record<AuraAccess, string> = {
  ver: "Só consulta",
  mover: "Consulta e move cards",
};

/** O master (administrador) sempre tem acesso completo à Central. */
export function auraAccessOf(user: Pick<User, "isAdmin" | "auraAccess">): AuraAccess | null {
  return user.isAdmin ? "mover" : (user.auraAccess ?? null);
}

export function auraConfigured() {
  return CHAVE.length >= 16;
}

type Dados = { leads: unknown[]; conversas: unknown[]; movimentos: unknown[]; teste?: string[] };

async function call(rota: string, init: RequestInit) {
  const res = await fetch(`${BASE}/${rota}`, {
    ...init,
    headers: { ...(init.headers || {}), "x-portal-chave": CHAVE, "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok === false) throw new Error(body?.erro || `n8n respondeu ${res.status}`);
  return body;
}

export async function fetchAuraData(): Promise<Dados> {
  const body = await call("portal-aura-dados", { method: "GET" });
  return {
    leads: Array.isArray(body.leads) ? body.leads : [],
    conversas: Array.isArray(body.conversas) ? body.conversas : [],
    movimentos: Array.isArray(body.movimentos) ? body.movimentos : [],
    teste: Array.isArray(body.teste) ? body.teste : [],
  };
}

export async function moveAuraCard(m: Movimento, por: string) {
  await call("portal-aura-mover", { method: "POST", body: JSON.stringify({ ...m, por: por.slice(0, 60) }) });
}

let template: Promise<string> | null = null;

/** Monta a página da Central com os dados embutidos (o mesmo visual do painel do n8n). */
export async function renderPanel(data: Record<string, unknown>) {
  template ??= readFile(path.join(process.cwd(), "src/lib/aura/painel.html"), "utf8");
  const json = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return (await template).replace("__DATA__", () => json);
}
