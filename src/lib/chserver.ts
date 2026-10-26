// Cliente somente leitura do Integrador BI do CHServer.
// Endereço, token e chaves vêm só de variáveis de ambiente; nada disso fica no código.

export type ChConfig = {
  baseUrl: string;
  token: string;
  cnpj: string;
  companyKey: string;
};

/** Aceita "servidor:8080", "http://servidor:8080/" ou a URL completa da doc (".../datasnap/rest/TCHAPI"). */
export function normalizeBaseUrl(input: string): string {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  s = s.replace(/\/+$/, "").replace(/\/datasnap(\/rest(\/TCHAPI)?)?$/i, "");
  return s;
}

/** Valida e normaliza os dados de conexão. Lança erro com mensagem amigável se algo estiver errado. */
export function validateChConfig(raw: { baseUrl: string; token: string; cnpj: string; companyKey: string }): ChConfig {
  const baseUrl = normalizeBaseUrl(raw.baseUrl);
  const cnpj = raw.cnpj.replace(/\D/g, "");
  const companyKey = raw.companyKey.trim();
  const token = raw.token.trim();
  if (!/^https?:\/\/[^\s/?#@]+$/i.test(baseUrl)) throw new Error("Endereço inválido. Use só o endereço e a porta, ex.: cloud.servidor.com.br:8080");
  if (!/^\d{14}$/.test(cnpj)) throw new Error("O CNPJ precisa ter 14 dígitos.");
  if (!/^[\w-]{1,40}$/.test(companyKey)) throw new Error("Chave da empresa inválida (use só letras, números e traço).");
  if (!token || token.length > 500 || /\s/.test(token)) throw new Error("Token inválido.");
  return { baseUrl, token, cnpj, companyKey };
}

export function readChConfig(env: NodeJS.ProcessEnv = process.env): ChConfig | null {
  const baseUrl = env.CHSERVER_URL?.trim();
  const token = env.CHSERVER_TOKEN?.trim();
  const cnpj = env.CHSERVER_CNPJ?.trim();
  const companyKey = env.CHSERVER_CHAVE_EMPRESA?.trim();
  if (!baseUrl || !token || !cnpj || !companyKey) return null;
  return validateChConfig({ baseUrl, token, cnpj, companyKey });
}

/** Só estes recursos podem ser consultados. Nada de escrita, PIX ou contas bancárias. */
const ALLOWED = new Set(["Receber", "Pagar", "NFSaida", "Empresa"]);

/** "AAAA-MM-DD" → "DD.MM.AAAA", formato de data da API. */
export function toChDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Aceita "DD.MM.AAAA", "DD/MM/AAAA", "AAAA-MM-DD" (com ou sem hora). Retorna "AAAA-MM-DD" ou null. */
export function parseChDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  let m = /^(\d{2})[./](\d{2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Valor em reais (número ou texto "1.234,56"/"1234.56") → centavos. */
export function parseChMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v !== "string" || !v.trim()) return null;
  let s = v.trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export function extractRecords(body: unknown): Record<string, unknown>[] {
  const result = (body as { result?: unknown })?.result;
  if (!Array.isArray(result)) throw new Error("Resposta inesperada do CHServer.");
  const first = result[0];
  if (Array.isArray(first)) return first.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  return [];
}

export async function chGet(cfg: ChConfig, resource: string, extra: string[] = [], fetchImpl: typeof fetch = fetch) {
  if (!ALLOWED.has(resource)) throw new Error(`Recurso não permitido: ${resource}`);
  const parts = [resource, cfg.cnpj, cfg.companyKey, ...extra].map((p) => encodeURIComponent(p));
  const url = `${cfg.baseUrl}/datasnap/rest/TCHAPI/${parts.join("/")}`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { "X-Token": cfg.token, "X-ChaveEmpresa": cfg.companyKey, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new Error(
      timeout
        ? `O CHServer em ${cfg.baseUrl} não respondeu em 30 segundos.`
        : `Não foi possível conectar ao CHServer em ${cfg.baseUrl}. Confira o endereço, a porta e se o CHServerWeb está ligado e liberado para acesso externo.`,
    );
  }
  if (res.status === 401 || res.status === 403) throw new Error("O CHServer recusou o acesso: confira o token e a chave da empresa.");
  if (!res.ok) throw new Error(`O CHServer respondeu com erro ${res.status} em ${resource}.`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("O endereço respondeu, mas não parece ser a API do Integrador BI. Confira a porta do CHServerWeb.");
  }
  return extractRecords(body);
}

export type ChTitle = {
  externalId: string;
  type: "entrada" | "saida";
  description: string;
  counterpart: string | null;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  externalCategory: string | null;
};

/** Converte um título de Receber ou Pagar no formato de lançamento. Retorna null se faltar dado essencial. */
export function mapTitle(kind: "Receber" | "Pagar", r: Record<string, unknown>): ChTitle | null {
  const key = r.CHAVE;
  if (key === undefined || key === null || key === "") return null;
  const amount = parseChMoney(r.VALOR);
  const dueDate = parseChDate(r.VENCIMENTO);
  if (amount === null || amount <= 0 || !dueDate) return null;
  const doc = r.DOCUMENTO ? String(r.DOCUMENTO) : "";
  const parcel = r.PARCELA && r.TOTPARC ? ` ${r.PARCELA}/${r.TOTPARC}` : "";
  const fallback = `${kind === "Receber" ? "Recebimento" : "Pagamento"} ${doc}${parcel}`.trim();
  const description = (typeof r.DESCRICAO === "string" && r.DESCRICAO.trim()) || fallback;
  return {
    externalId: `${kind.toLowerCase()}:${String(key)}`,
    type: kind === "Receber" ? "entrada" : "saida",
    description: description.slice(0, 200),
    counterpart: r.CHAVECLIFOR != null && r.CHAVECLIFOR !== "" ? `Cliente/fornecedor CH ${String(r.CHAVECLIFOR)}` : null,
    amount,
    dueDate,
    paidAt: parseChDate(kind === "Receber" ? r.DATABAIXA : r.DATAPAGAMENTO),
    externalCategory: typeof r.DESCRPLANOCTA === "string" ? r.DESCRPLANOCTA.slice(0, 100) : null,
  };
}
