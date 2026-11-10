import { describe, expect, it, vi } from "vitest";
import { chGet, extractRecords, mapTitle, titleState, parseChDate, parseChMoney, readChConfig, toChDate } from "@/lib/chserver";

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
  it("segue a situação do CHServer: excluído, cancelado, pago e parcial", () => {
    const base = { CHAVE: 9, VENCIMENTO: "05.11.2026", VALOR: 100, DATAPAGAMENTO: null };
    expect(titleState("Pagar", { ...base, ATIVO: 2, STATUS: 1 })).toBe("excluido");
    expect(mapTitle("Pagar", { ...base, ATIVO: 2, STATUS: 1 })).toBeNull();
    expect(mapTitle("Pagar", { ...base, ATIVO: 1, STATUS: 2 })).toBeNull();
    expect(mapTitle("Pagar", { ...base, STATUS: "CANCELADO" })).toBeNull();
    const pago = mapTitle("Pagar", { ...base, STATUS: 0, VLRPAGO: 103.5, DATAHORAALT: "2026-11-06T10:00:00" })!;
    expect(pago.paidAt).toBe("2026-11-06");
    expect(pago.amount).toBe(10350);
    expect(mapTitle("Pagar", { ...base, ATIVO: 1, STATUS: 1, RECEBPARCIAL: 40 })!.amount).toBe(6000);
    expect(mapTitle("Pagar", { ...base, STATUS: 1, DATAPAGAMENTO: "01.11.2026" })!.paidAt).toBeNull();
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

import { mapSale, saleNet } from "@/lib/chserver";

describe("mapSale", () => {
  it("converte a nota de saída do exemplo da documentação", () => {
    const s = mapSale({
      CHAVE: 1905,
      NUMERONF: "000004",
      DATANF: "2025-06-10T00:00:00.000-03:00",
      HORASAIDA: 0.640810185185185,
      CHAVECLIFOR: 10,
      TOTALNF: 5.88,
      VALORDEVOLV: 0.0,
      DESCONTO: 0.0,
      STATUS: "FATURADA",
      MODELO: "01",
      FORMAPGTO: [],
      ITENS: [{ PRODUTO: "PRODUTO 001040", QTDE: 1.0, VLRTOTAL: 2.59 }],
    })!;
    expect(s.externalId).toBe("nf:1905");
    expect(s.date).toBe("2025-06-10");
    expect(s.time).toBe("15:23");
    expect(s.total).toBe(588);
    expect(s.canceled).toBe(false);
    expect(s.items).toEqual([{ produto: "PRODUTO 001040", qtde: 1, total: 259 }]);
    expect(saleNet(s)).toBe(588);
  });
  it("nota cancelada e devolução", () => {
    expect(saleNet({ total: 1000, returned: 300, canceled: false })).toBe(700);
    expect(mapSale({ CHAVE: 1, DATANF: "01.10.2026", TOTALNF: 10, STATUS: "CANCELADA" })!.canceled).toBe(true);
    expect(mapSale({ DATANF: "01.10.2026", TOTALNF: 10 })).toBeNull();
  });
});
