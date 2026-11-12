// Validação das orientações da Aurora e dos leads manuais da Central (puro, sem servidor, para poder testar).
// O n8n confere tudo de novo antes de gravar; aqui é a primeira barreira.

export const ORIGENS = ["indicacao", "presencial", "telefone", "instagram", "ex_aluno", "outro"] as const;
export const ETAPAS_LEAD = [
  "novo",
  "qualificando",
  "valor_apresentado",
  "documentos",
  "aguardando_thalia",
  "pix_enviado",
  "comprovante",
  "matriculado",
] as const;

export const NIVEIS = ["eja", "tecnico", "graduacao", "pos", "mestrado"] as const;
export type Nivel = (typeof NIVEIS)[number];

export function parseNivel(b: unknown): { numero: string; nivel: Nivel } | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const numero = String(o.numero ?? "").replace(/\D/g, "").slice(0, 20);
  const nivel = String(o.nivel ?? "") as Nivel;
  if (!numero || !NIVEIS.includes(nivel)) return null;
  return { numero, nivel };
}

export type Instrucao =
  | { acao: "adicionar"; texto: string }
  | { acao: "remover"; chave: string };

export type NovoLead = {
  nome: string;
  numero: string;
  cidade: string;
  curso: string;
  origem: (typeof ORIGENS)[number];
  etapa: (typeof ETAPAS_LEAD)[number];
  nivel: Nivel | "";
  obs: string;
};

const txt = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export function parseInstrucao(b: unknown): Instrucao | { erro: string } {
  if (!b || typeof b !== "object") return { erro: "dados inválidos" };
  const o = b as Record<string, unknown>;
  if (o.acao === "remover") {
    const chave = txt(o.chave, 40);
    if (!/^[a-z0-9]+$/i.test(chave)) return { erro: "orientação não encontrada" };
    return { acao: "remover", chave };
  }
  const texto = txt(o.texto, 1500);
  if (texto.length < 5) return { erro: "escreva a orientação" };
  return { acao: "adicionar", texto };
}

export function parseLead(b: unknown): NovoLead | { erro: string } {
  if (!b || typeof b !== "object") return { erro: "dados inválidos" };
  const o = b as Record<string, unknown>;
  const nome = txt(o.nome, 80);
  const numero = String(o.numero ?? "").replace(/\D/g, "").slice(0, 15);
  if (nome.length < 3) return { erro: "informe o nome" };
  if (numero.length < 10) return { erro: "informe o WhatsApp com DDD" };
  const origem = (ORIGENS as readonly string[]).includes(String(o.origem)) ? (o.origem as NovoLead["origem"]) : "outro";
  const etapa = (ETAPAS_LEAD as readonly string[]).includes(String(o.etapa)) ? (o.etapa as NovoLead["etapa"]) : "novo";
  const nivel = (NIVEIS as readonly string[]).includes(String(o.nivel)) ? (o.nivel as Nivel) : "";
  return { nome, numero, cidade: txt(o.cidade, 60), curso: txt(o.curso, 120), origem, etapa, nivel, obs: txt(o.obs, 600) };
}
