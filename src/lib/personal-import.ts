import { isValidIsoDate, parseMoney } from "./format";

/** Gasto lido da lista colada, antes de conferir e lançar. category = nome sugerido (pode não existir ainda). */
export type ImportRow = { date: string; amount: number; description: string; category: string };

export const UNSPECIFIED = "Não especificado";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Palavra-chave → categoria padrão da área Pessoal. A primeira que bater vence (mais específicas primeiro).
const GUESS: [RegExp, string][] = [
  [/remedio|farmacia|consulta|medic|exame|dentista/, "Saúde e farmácia"],
  [/davi|escola|filho|creche|kids/, "Filhos"],
  [/dizimo|oferta|igreja/, "Dízimo e ofertas"],
  [/energia|luz|internet|lavanderia|agua casa|conta de agua|gas\b/, "Contas da casa (luz, água, internet)"],
  [/mercado|komprao|supermercado|acougue|padaria|sabao|salame|feira|^agua$/, "Mercado"],
  [/lanche|almoco|janta|restaurante|salgado|bolo|sorvete|mulse|musse|mousse|pizza|ifood|delivery|cafe/, "Restaurantes e delivery"],
  [/unha|salao|cabelo|barbearia|spray|perfume|maquiagem/, "Cuidados pessoais"],
  [/casaco|calca|camisa|roupa|sapato|tenis|blusa|vestido/, "Roupas"],
  [/carro|gasolina|combustivel|uber|onibus|estacionamento|pedagio|lavacao/, "Transporte e combustível"],
  [/presente/, "Presentes"],
  [/cinema|passeio|viagem|lazer/, "Lazer e viagens"],
  [/netflix|spotify|assinatura/, "Assinaturas"],
  [/celular|conserto/, "Outros gastos"],
];

export function guessCategory(description: string): string {
  const d = norm(description);
  if (!/[a-z]/.test(d)) return UNSPECIFIED;
  for (const [re, cat] of GUESS) if (re.test(d)) return cat;
  return UNSPECIFIED;
}

const dmy = (s: string): string | null => {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return isValidIsoDate(s.trim()) ? s.trim() : null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidIsoDate(iso) ? iso : null;
};

// Valor no começo ou no fim da linha: "100 Davi presente", "Lavanderia 16,00", "$62,9", "15 reais - salgado".
const MONEY = String.raw`(?:R?\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
const LEADING = new RegExp(String.raw`^${MONEY}(?:\s*reais)?\s*[-–:]?\s*(.*)$`, "i");
const TRAILING = new RegExp(String.raw`^(.*?)\s*[-–:]?\s*${MONEY}(?:\s*reais)?$`, "i");

function amountAndText(line: string): { amount: number; text: string } | null {
  const s = line.trim();
  for (const [re, ai, ti] of [
    [LEADING, 1, 2],
    [TRAILING, 2, 1],
  ] as const) {
    const m = s.match(re);
    if (!m) continue;
    const amount = parseMoney(m[ai].includes(".") && !m[ai].includes(",") && /\.\d{1,2}$/.test(m[ai]) ? m[ai].replace(".", ",") : m[ai]);
    if (amount && amount > 0) return { amount, text: m[ti].trim().replace(/^[-–:]\s*/, "") };
  }
  return null;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Lê a lista colada. Aceita:
 * - conversa exportada/copiada do WhatsApp: "[12:19, 01/10/2026] Fulano: 100 Davi presente", com itens extras nas linhas seguintes;
 * - planilha/CSV: "data;valor;descrição;categoria" (data em 2026-10-01 ou 01/10/2026; categoria opcional).
 * Linhas que não dá para entender voltam em `skipped`, para a pessoa ver e corrigir.
 */
export function parseExpenses(text: string): { rows: ImportRow[]; skipped: string[] } {
  const rows: ImportRow[] = [];
  const skipped: string[] = [];
  let current: string | null = null; // data da última mensagem do WhatsApp
  const push = (date: string, body: string, category?: string) => {
    const v = amountAndText(body);
    if (!v) return false;
    const description = cap(v.text) || UNSPECIFIED;
    rows.push({ date, amount: v.amount, description: description.slice(0, 200), category: category?.trim() || guessCategory(v.text) });
    return true;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // WhatsApp: "[hh:mm, dd/mm/aaaa] Nome: texto" ou "dd/mm/aaaa hh:mm - Nome: texto"
    const wa = line.match(/^\[\d{1,2}:\d{2}(?::\d{2})?,\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\]\s*[^:]+:\s*(.*)$/) ?? line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4}),?\s+\d{1,2}:\d{2}\s*-\s*[^:]+:\s*(.*)$/);
    if (wa) {
      current = dmy(wa[1]);
      if (!current || !push(current, wa[2])) skipped.push(line);
      continue;
    }
    // Planilha: separada por ; ou tab
    const cols = line.split(/;|\t/);
    if (cols.length >= 2) {
      if (/^data$/i.test(cols[0].trim())) continue; // cabeçalho
      const date = dmy(cols[0]);
      const amount = parseMoney(cols[1].trim());
      if (date && amount && amount > 0) {
        rows.push({ date, amount, description: (cols[2]?.trim() || UNSPECIFIED).slice(0, 200), category: cols[3]?.trim() || guessCategory(cols[2] ?? "") });
        continue;
      }
    }
    // Continuação de uma mensagem do WhatsApp com vários itens.
    if (current && push(current, line)) continue;
    skipped.push(line);
  }
  return { rows, skipped };
}

/** Acha a categoria pelo nome (sem diferenciar maiúsculas e acentos). */
export function matchCategory<T extends { name: string }>(cats: T[], name: string): T | undefined {
  const n = norm(name.trim());
  return cats.find((c) => norm(c.name) === n) ?? cats.find((c) => norm(c.name).startsWith(n) || n.startsWith(norm(c.name)));
}
