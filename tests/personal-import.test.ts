import { describe, expect, it } from "vitest";
import { guessCategory, matchCategory, parseExpenses, UNSPECIFIED } from "@/lib/personal-import";

describe("importar gastos pessoais", () => {
  it("lê a conversa do WhatsApp, com valor no começo ou no fim e mensagem com vários itens", () => {
    const { rows, skipped } = parseExpenses(`[12:19, 01/10/2026] Willian Batista: 100 Davi presente
[12:20, 01/10/2026] Willian Batista: 27,00
[08:05, 02/10/2026] Willian Batista: 15 reais - salgado
[00:48, 04/10/2026] Willian Batista: Lavanderia 16,00
[11:00, 08/10/2026] Amor: 17,99 sabão em pó
19,99 spray cabelo
25,00 salame
[09:12, 23/10/2026] Amor: $113,28 komprao
[12:40, 31/10/2026] Amor: $62,9
[13:00, 31/10/2026] Amor: bom dia`);
    expect(rows.map((r) => [r.date, r.amount, r.description, r.category])).toEqual([
      ["2026-10-01", 10000, "Davi presente", "Filhos"],
      ["2026-10-01", 2700, UNSPECIFIED, UNSPECIFIED],
      ["2026-10-02", 1500, "Salgado", "Restaurantes e delivery"],
      ["2026-10-04", 1600, "Lavanderia", "Contas da casa (luz, água, internet)"],
      ["2026-10-08", 1799, "Sabão em pó", "Mercado"],
      ["2026-10-08", 1999, "Spray cabelo", "Cuidados pessoais"],
      ["2026-10-08", 2500, "Salame", "Mercado"],
      ["2026-10-23", 11328, "Komprao", "Mercado"],
      ["2026-10-31", 6290, UNSPECIFIED, UNSPECIFIED],
    ]);
    expect(skipped).toEqual(["[13:00, 31/10/2026] Amor: bom dia"]);
  });

  it("lê planilha data;valor;descrição;categoria", () => {
    const { rows } = parseExpenses("data;valor;descricao;categoria\n2026-10-28;446,40;Energia casa;Contas da casa\n05/10/2026;1.438,00;Mercado");
    expect(rows).toEqual([
      { date: "2026-10-28", amount: 44640, description: "Energia casa", category: "Contas da casa" },
      { date: "2026-10-05", amount: 143800, description: "Mercado", category: "Mercado" },
    ]);
  });

  it("sugere categoria por palavra-chave e acha pelo nome sem acento", () => {
    expect(guessCategory("remédio Davi")).toBe("Saúde e farmácia");
    expect(guessCategory("Oferta igreja")).toBe("Dízimo e ofertas");
    expect(guessCategory("Lavação carro")).toBe("Transporte e combustível");
    expect(guessCategory("xyz")).toBe(UNSPECIFIED);
    const cats = [{ name: "Contas da casa (luz, água, internet)" }, { name: "Saúde e farmácia" }];
    expect(matchCategory(cats, "saude e farmacia")?.name).toBe("Saúde e farmácia");
    expect(matchCategory(cats, "Contas da casa")?.name).toBe("Contas da casa (luz, água, internet)");
    expect(matchCategory(cats, "Lazer")).toBeUndefined();
  });
});

describe("sugestões do dia a dia", () => {
  it.each([
    ["coquetel kids/igreja", "Filhos"],
    ["água", "Mercado"],
    ["mulse", "Restaurantes e delivery"],
    ["tela de celular", "Outros gastos"],
  ])("%s → %s", (d, c) => expect(guessCategory(d)).toBe(c));
});
