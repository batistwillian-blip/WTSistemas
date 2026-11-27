// Metas comerciais mostradas no topo da Central, por instituição. Ao fechar uma campanha, acrescente a próxima aqui.
// Instituições: UNIFAEL (graduação e pós), CEFE Educa (EJA e técnico) e AGTU (mestrado).
export type Instituicao = "unifael" | "cefe" | "agtu";
export type NivelMeta = "graduacao" | "pos" | "eja" | "tecnico" | "mestrado";
export type MetaCampanha = {
  inst: Instituicao;
  nome: string;
  inicio: string;
  fim: string;
  /** Cada linha soma as matrículas dos níveis listados (ex.: CEFE conta EJA + técnico juntos). */
  linhas: { niveis: NivelMeta[]; rotulo: string; meta: number }[];
  nota: string;
};

export const INSTITUICOES: Instituicao[] = ["unifael", "cefe", "agtu"];

export const CAMPANHAS: MetaCampanha[] = [
  {
    inst: "unifael",
    nome: "Campanha 27-1 · Verão (Grupo Ser)",
    inicio: "2026-11-01",
    fim: "2027-03-31",
    linhas: [
      { niveis: ["graduacao"], rotulo: "Graduação", meta: 70 },
      { niveis: ["pos"], rotulo: "Pós-graduação", meta: 15 },
    ],
    nota: "Aqui contam as matrículas confirmadas no funil (Pix pago). Para o bônus, o Grupo Ser só considera quem pagou a 1ª, 2ª e 3ª parcelas.",
  },
  {
    inst: "cefe",
    nome: "Campanha 27-1 · Verão",
    inicio: "2026-11-01",
    fim: "2027-03-31",
    linhas: [{ niveis: ["eja", "tecnico"], rotulo: "EJA + Técnico", meta: 20 }],
    nota: "Contam as matrículas confirmadas no funil, somando EJA e cursos técnicos.",
  },
  // AGTU: sem meta cadastrada ainda; a Central mostra "meta a definir".
];

/** Campanha em andamento de uma instituição (ou a última dela, depois que todas acabarem). */
export function metaDa(inst: Instituicao, hoje = new Date().toISOString().slice(0, 10)): MetaCampanha | null {
  const lista = CAMPANHAS.filter((c) => c.inst === inst);
  return lista.find((c) => hoje >= c.inicio && hoje <= c.fim) ?? lista.at(-1) ?? null;
}

/** Uma entrada por instituição, com a campanha atual dela ou null quando ainda não há meta. */
export function metasAtuais(hoje?: string): { inst: Instituicao; campanha: MetaCampanha | null }[] {
  return INSTITUICOES.map((inst) => ({ inst, campanha: metaDa(inst, hoje) }));
}
