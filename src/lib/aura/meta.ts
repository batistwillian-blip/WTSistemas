// Metas comerciais do polo mostradas no topo da Central. Ao fechar uma campanha, acrescente a próxima aqui.
export type MetaCampanha = { nome: string; inicio: string; fim: string; graduacao: number; pos: number; nota: string };

export const CAMPANHAS: MetaCampanha[] = [
  {
    nome: "Campanha 27-1 · Verão (Grupo Ser)",
    inicio: "2026-11-01",
    fim: "2027-03-31",
    graduacao: 70,
    pos: 15,
    nota: "Aqui contam as matrículas confirmadas no funil (Pix pago). Para o bônus, o Grupo Ser só considera quem pagou a 1ª, 2ª e 3ª parcelas.",
  },
];

/** Campanha em andamento (ou a última, depois que todas acabarem). */
export function metaAtual(hoje = new Date().toISOString().slice(0, 10)): MetaCampanha | null {
  return CAMPANHAS.find((c) => hoje >= c.inicio && hoje <= c.fim) ?? CAMPANHAS.at(-1) ?? null;
}
