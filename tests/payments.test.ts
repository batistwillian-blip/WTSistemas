import { describe, expect, it } from "vitest";
import { cleanMethod, defaultDays, salePayments, UNKNOWN_METHOD } from "../src/lib/chserver";

describe("formas de pagamento das vendas", () => {
  it("sem forma informada vai tudo para 'Não informada'", () => {
    expect(salePayments(null, 5000)).toEqual([{ method: UNKNOWN_METHOD, amount: 5000 }]);
    expect(salePayments([], 5000)).toEqual([{ method: UNKNOWN_METHOD, amount: 5000 }]);
  });
  it("divide por forma (objetos) e junta formas iguais", () => {
    const r = salePayments(
      [
        { DESCRICAO: "Dinheiro", VALOR: 20 },
        { DESCRICAO: "Cartao (pagsegur) - Cr", VALOR: "30,00" },
        { DESCRICAO: "Dinheiro", VALOR: 10 },
      ],
      6000,
    );
    expect(r).toEqual([
      { method: "Dinheiro", amount: 3000 },
      { method: "Cartao (pagsegur) - Cr", amount: 3000 },
    ]);
  });
  it("lê o texto do CH e acerta troco ou devolução na maior forma", () => {
    const r = salePayments(["FORMA PGTO: Dinheiro Valor: 50,00 - Caixa: USUARIO - 4.SERVER-PC.SERVER", "FORMA PGTO: Cartao (pix) - Venda Valor: 25,00"], 7000);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(7000);
    expect(r.map((x) => x.method).sort()).toEqual(["Cartao (pix)", "Dinheiro"]);
  });
  it("sem valores nas formas, tudo vai para a primeira", () => {
    expect(salePayments([{ FORMA: "Cartao (visa) - D" }], 1234)).toEqual([{ method: "Cartao (visa) - D", amount: 1234 }]);
  });
  it("prazo padrão: cartão D+1, Pix e dinheiro na hora", () => {
    expect(defaultDays("Cartao (visa) - Cr")).toBe(1);
    expect(defaultDays("Cartao (infinitypay (t)) - D")).toBe(1);
    expect(defaultDays("Cartao (pix)")).toBe(0);
    expect(defaultDays("Cartão / Vendas outras")).toBe(0);
    expect(defaultDays("Dinheiro")).toBe(0);
    expect(cleanMethod("  Cartao   (visa) - D ")).toBe("Cartao (visa) - D");
  });
});
