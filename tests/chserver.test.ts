import { describe, expect, it, vi } from "vitest";
import { chGet, extractRecords, mapTitle, parseChDate, parseChMoney, readChConfig, toChDate } from "@/lib/chserver";

const env = {
  CHSERVER_URL: "http://servidor.exemplo:8080/",
  CHSERVER_TOKEN: "tok",
  CHSERVER_CNPJ: "11.222.333/0001-81",
  CHSERVER_CHAVE_EMPRESA: "1",
} as unknown as NodeJS.ProcessEnv;

describe("configuração", () => {
  it("fica desligada sem variáveis", () => {
    expect(readChConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });
  it("normaliza endereço e CNPJ", () => {
    expect(readChConfig(env)).toEqual({ baseUrl: "http://servidor.exemplo:8080", token: "tok", cnpj: "11222333000181", companyKey: "1" });
  });
  it("recusa endereço com caminho", () => {
    expect(() => readChConfig({ ...env, CHSERVER_URL: "http://x/abc" })).toThrow();
  });
});

describe("conversões", () => {
  it("datas", () => {
    expect(toChDate("2026-10-05")).toBe("05.10.2026");
    expect(parseChDate("05.10.2026")).toBe("2026-10-05");
    expect(parseChDate("05/10/2026 10:00")).toBe("2026-10-05");
    expect(parseChDate("2026-10-05T00:00:00")).toBe("2026-10-05");
    expect(parseChDate(null)).toBeNull();
    expect(parseChDate("")).toBeNull();
  });
  it("valores", () => {
    expect(parseChMoney(150.5)).toBe(15050);
    expect(parseChMoney("1.234,56")).toBe(123456);
    expect(parseChMoney("99.9")).toBe(9990);
    expect(parseChMoney("x")).toBeNull();
  });
  it("extrai registros da resposta", () => {
    expect(extractRecords({ result: [[{ A: 1 }], 1] })).toEqual([{ A: 1 }]);
    expect(extractRecords({ result: [[], 0] })).toEqual([]);
    expect(() => extractRecords({})).toThrow();
  });
});

describe("mapTitle", () => {
  it("mapeia título a receber baixado", () => {
    const t = mapTitle("Receber", {
      CHAVE: 77,
      DOCUMENTO: "123",
      PARCELA: 2,
      TOTPARC: 3,
      VENCIMENTO: "10.11.2026",
      VALOR: 250,
      CHAVECLIFOR: 9,
      DESCRICAO: "",
      DATABAIXA: "09.11.2026",
      DESCRPLANOCTA: "VENDAS",
    });
    expect(t).toEqual({
      externalId: "receber:77",
      type: "entrada",
      description: "Recebimento 123 2/3",
      counterpart: "Cliente/fornecedor CH 9",
      amount: 25000,
      dueDate: "2026-11-10",
      paidAt: "2026-11-09",
      externalCategory: "VENDAS",
    });
  });
  it("título a pagar em aberto", () => {
    const t = mapTitle("Pagar", { CHAVE: "5", VENCIMENTO: "01.12.2026", VALOR: "80,00", DESCRICAO: "Fornecedor X", DATAPAGAMENTO: null });
    expect(t?.type).toBe("saida");
    expect(t?.paidAt).toBeNull();
    expect(t?.description).toBe("Fornecedor X");
  });
  it("ignora título sem chave ou valor", () => {
    expect(mapTitle("Pagar", { VENCIMENTO: "01.12.2026", VALOR: 1 })).toBeNull();
    expect(mapTitle("Pagar", { CHAVE: 1, VENCIMENTO: "01.12.2026", VALOR: 0 })).toBeNull();
  });
});

describe("chGet", () => {
  it("monta a URL só com GET e os headers corretos", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ result: [[{ CHAVE: 1 }], 1] })));
    const cfg = readChConfig(env)!;
    const rows = await chGet(cfg, "Receber", ["01.10.2026", "31.10.2026"], fetchMock as unknown as typeof fetch);
    expect(rows).toEqual([{ CHAVE: 1 }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://servidor.exemplo:8080/datasnap/rest/TCHAPI/Receber/11222333000181/1/01.10.2026/31.10.2026");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-Token"]).toBe("tok");
  });
  it("bloqueia recursos fora da lista (escrita, PIX, contas bancárias)", async () => {
    const cfg = readChConfig(env)!;
    await expect(chGet(cfg, "ContasBancarias")).rejects.toThrow("não permitido");
    await expect(chGet(cfg, "Pedido")).rejects.toThrow("não permitido");
  });
});
