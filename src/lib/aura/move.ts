// Validação do movimento de card da Central da Aura (puro, sem servidor, para poder testar).

export const ETAPAS = [
  "novo",
  "qualificando",
  "valor_apresentado",
  "documentos",
  "aguardando_thalia",
  "pix_enviado",
  "comprovante",
  "matriculado",
  "perdido",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export type Movimento = { numero: string; de: string; para: Etapa; motivo: string; curso: string };

export function parseMove(b: unknown): Movimento | null {
  if (!b || typeof b !== "object") return null;
  const o = b as Record<string, unknown>;
  const numero = String(o.numero ?? "").replace(/\D/g, "").slice(0, 20);
  const para = String(o.para ?? "") as Etapa;
  if (!numero || !ETAPAS.includes(para)) return null;
  const txt = (v: unknown) => String(v ?? "").trim().slice(0, 200);
  return {
    numero,
    de: ETAPAS.includes(txt(o.de) as Etapa) ? txt(o.de) : "",
    para,
    motivo: para === "perdido" ? txt(o.motivo) || "Não informado" : "",
    curso: para === "matriculado" ? txt(o.curso) : "",
  };
}

