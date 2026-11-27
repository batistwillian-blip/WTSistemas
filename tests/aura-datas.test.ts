import { describe, expect, it } from "vitest";
import { corrigeDatasDosLeads, etapaEmReal } from "@/lib/aura/datas";

describe("etapaEmReal", () => {
  it("tira as 3 horas que o n8n adianta numa gravação nova", () => {
    // Movido às 20:09:49Z; a coluna guardou 23:09:49Z e o registro foi gravado às 20:09:49Z.
    expect(etapaEmReal({ etapa_em: "2026-11-27T23:09:49.833Z", updatedAt: "2026-11-27T20:09:49.850Z" })).toBe("2026-11-27T20:09:49.833Z");
  });
  it("usa a última gravação quando a data andou para frente com as mensagens", () => {
    // Edna: repassada em 24/11 03:22Z, etapa_em foi parar em 25/11 03:22Z, registro gravado em 24/11 12:45Z.
    expect(etapaEmReal({ etapa_em: "2026-11-25T03:22:23.959Z", updatedAt: "2026-11-24T12:45:22.967Z" })).toBe("2026-11-24T12:45:22.967Z");
  });
  it("sem updatedAt, só desconta as 3 horas", () => {
    expect(etapaEmReal({ etapa_em: "2026-11-27T23:00:00.000Z" })).toBe("2026-11-27T20:00:00.000Z");
  });
  it("mantém o valor quando não há data da etapa", () => {
    expect(etapaEmReal({ etapa_em: null, updatedAt: "2026-11-27T20:00:00.000Z" })).toBeNull();
    expect(etapaEmReal({ updatedAt: "2026-11-27T20:00:00.000Z" })).toBeUndefined();
  });
});

describe("corrigeDatasDosLeads", () => {
  it("só muda etapa_em e preserva os outros campos", () => {
    const [l] = corrigeDatasDosLeads([{ numero: "1", nome: "A", etapa_em: "2026-11-27T23:00:00.000Z", updatedAt: "2026-11-27T22:00:00.000Z" }]);
    expect(l).toEqual({ numero: "1", nome: "A", etapa_em: "2026-11-27T20:00:00.000Z", updatedAt: "2026-11-27T22:00:00.000Z" });
  });
  it("ignora itens que não são objetos", () => {
    expect(corrigeDatasDosLeads([null, "x"])).toEqual([null, "x"]);
  });
});
