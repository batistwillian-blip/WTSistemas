import { addMonths } from "./format";

export type SeriesMode = "unica" | "mensal" | "parcelada";

/** Quantos meses gerar já de saída numa conta fixa sem data de fim (o resto o sistema estende sozinho). */
export const OPEN_ENDED_MONTHS = 12;

/** Divide um total em N parcelas em centavos; a sobra do arredondamento vai na primeira. */
export function splitInstallments(total: number, n: number): number[] {
  const base = Math.floor(total / n);
  const rest = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? rest : 0));
}

/**
 * Ocorrências de uma conta nova: única, fixa mensal (mesmo valor todo mês) ou parcelada.
 * Cada uma leva o nº da parcela e o total (sem total na fixa sem fim) e a competência anda junto com o vencimento.
 * Na parcelada, `amountIsTotal` diz se o valor informado é o total (dividido) ou o de cada parcela.
 */
export function planSeries(opts: {
  mode: SeriesMode;
  amount: number;
  dueDate: string;
  competence: string;
  count: number;
  amountIsTotal?: boolean;
  openEnded?: boolean;
}): { dueDate: string; competence: string; amount: number; installment: number | null; installments: number | null }[] {
  const { mode, amount, dueDate, competence } = opts;
  if (mode === "unica" || opts.count <= 1) return [{ dueDate, competence, amount, installment: null, installments: null }];
  const n = opts.count;
  const values = mode === "parcelada" && opts.amountIsTotal ? splitInstallments(amount, n) : Array.from({ length: n }, () => amount);
  return values.map((v, i) => ({
    dueDate: addMonths(dueDate, i),
    competence: addMonths(competence, i),
    amount: v,
    installment: i + 1,
    installments: opts.openEnded ? null : n,
  }));
}

/** "2/3" para parcelas, "5ª" para conta fixa sem fim, nada para conta única. */
export function installmentLabel(t: { installment: number | null; installments: number | null }): string | null {
  if (!t.installment) return null;
  return t.installments ? `${t.installment}/${t.installments}` : `${t.installment}ª`;
}

/** Numeração automática do sistema: letra A + 5 dígitos. Qualquer outro formato é documento externo (NF, pedido). */
export const SYSTEM_DOC = /^A\d{5,}$/;

export function systemDocument(n: number): string {
  return "A" + String(n).padStart(5, "0");
}

/** "2026-10" ou "2026-10-15" → "2026-10-01"; inválido → null. */
export function competenceOf(input: string): string | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])/.exec(input);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

export type Settlement =
  | { kind: "total" | "parcial"; paid: number; interest: number; discount: number; principal: number; remaining: number }
  | { error: string };

/**
 * Calcula a baixa de uma conta em aberto. principal = pago − juros + desconto é o quanto da conta foi quitado.
 * Pago acima do devido vira juros; abaixo só é aceito como pagamento parcial (o restante continua em aberto).
 */
export function settle(opts: { open: number; paid: number; interest: number; discount: number; partial: boolean }): Settlement {
  const { open, partial } = opts;
  let { interest } = opts;
  const { paid, discount } = opts;
  if (paid <= 0) return { error: "Informe o valor pago." };
  if (interest < 0 || discount < 0) return { error: "Juros e desconto não podem ser negativos." };
  if (discount >= open + interest) return { error: "O desconto não pode ser maior que a conta." };
  let principal = paid - interest + discount;
  if (principal <= 0) return { error: "O valor pago não cobre nem os juros informados." };
  if (principal > open) {
    interest += principal - open;
    principal = open;
  }
  if (principal === open) return { kind: "total", paid, interest, discount, principal, remaining: 0 };
  if (!partial) {
    return {
      error: "O valor pago é menor que o da conta. Marque \"Pagamento parcial\" para deixar o restante em aberto, ou lance a diferença como desconto.",
    };
  }
  return { kind: "parcial", paid, interest, discount, principal, remaining: open - principal };
}

/** Vencimentos que faltam numa conta fixa sem fim: mesmo dia do primeiro vencimento, depois de `lastDue` e até `horizon`. */
export function missingMonths(firstDue: string, lastDue: string, horizon: string): string[] {
  const out: string[] = [];
  for (let i = 1; i < 600; i++) {
    const d = addMonths(firstDue, i);
    if (d > horizon) break;
    if (d > lastDue) out.push(d);
  }
  return out;
}
