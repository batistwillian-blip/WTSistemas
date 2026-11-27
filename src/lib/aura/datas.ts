// A coluna "etapa_em" da tabela de leads no n8n grava a hora 3 horas adiantada (defeito do n8n
// nessa coluna) e, enquanto o lead conversa na mesma etapa, a Aurora regrava o valor lido, então
// a data anda mais 3 horas a cada mensagem. Os fluxos do n8n (Pix pendente e eventos da Meta)
// usam a mesma regra daqui: a data da etapa é o menor valor entre (etapa_em - 3h) e a última
// gravação do registro (updatedAt), que o próprio n8n guarda certo.
const ADIANTO_MS = 3 * 60 * 60 * 1000;

function ms(v: unknown): number | null {
  if (typeof v !== "string" && !(v instanceof Date)) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

/** Devolve a data real em que o lead entrou na etapa atual (ISO), ou o valor original se não der para corrigir. */
export function etapaEmReal(lead: { etapa_em?: unknown; updatedAt?: unknown }): unknown {
  const e = ms(lead.etapa_em);
  const u = ms(lead.updatedAt);
  if (e === null) return lead.etapa_em;
  const corrigida = e - ADIANTO_MS;
  return new Date(u === null ? corrigida : Math.min(corrigida, u)).toISOString();
}

/** Aplica a correção em cada lead da lista, sem mexer nos outros campos. */
export function corrigeDatasDosLeads(leads: unknown[]): unknown[] {
  return leads.map((l) => (l && typeof l === "object" ? { ...(l as Record<string, unknown>), etapa_em: etapaEmReal(l as Record<string, unknown>) } : l));
}
