export const NATURES = ["emprestimo", "devolucao", "aporte", "transferencia"] as const;
export type Nature = (typeof NATURES)[number];

export const natureLabels: Record<Nature, string> = {
  emprestimo: "Empréstimo",
  devolucao: "Devolução de empréstimo",
  aporte: "Aporte (não precisa devolver)",
  transferencia: "Transferência entre contas",
};

export const accountKindLabels = { caixa: "Caixa físico", banco: "Conta bancária", carteira: "Carteira digital" } as const;

export const companyDescriptions: Record<string, string> = {
  "primetech-loja": "Acessórios de celular e informática",
  "aura-educa": "EJA, graduação, pós e mestrado",
  "primetech-sistemas": "Revenda de sistemas e consultoria em TI",
};
