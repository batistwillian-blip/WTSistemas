import { describe, expect, it } from "vitest";
import { parseChat, parseInstrucao, parseLead, parseNivel } from "@/lib/aura/extras";

describe("parseInstrucao", () => {
  it("aceita orientação nova e limpa espaços", () => {
    expect(parseInstrucao({ acao: "adicionar", texto: "  Ofereça sexta à tarde  " })).toEqual({ acao: "adicionar", texto: "Ofereça sexta à tarde" });
  });
  it("recusa texto curto ou vazio", () => {
    expect(parseInstrucao({ texto: "oi" })).toEqual({ erro: "escreva a orientação" });
    expect(parseInstrucao(null)).toEqual({ erro: "dados inválidos" });
  });
  it("remover exige chave simples", () => {
    expect(parseInstrucao({ acao: "remover", chave: "imhx9k2abcd" })).toEqual({ acao: "remover", chave: "imhx9k2abcd" });
    expect(parseInstrucao({ acao: "remover", chave: "x'; drop" })).toEqual({ erro: "orientação não encontrada" });
  });
});

describe("parseLead", () => {
  it("aceita lead válido e só guarda dígitos do WhatsApp", () => {
    expect(parseLead({ nome: "Maria Silva", numero: "(47) 99999-0000", origem: "indicacao", etapa: "qualificando" })).toEqual({
      nome: "Maria Silva",
      numero: "47999990000",
      cidade: "",
      curso: "",
      origem: "indicacao",
      etapa: "qualificando",
      nivel: "",
      obs: "",
      inicia: "thalia",
      contexto: "",
    });
  });
  it("origem ou etapa desconhecida cai no padrão; perdido não é etapa de entrada", () => {
    expect(parseLead({ nome: "Ana Paula", numero: "4799990000", origem: "x", etapa: "perdido" })).toMatchObject({ origem: "outro", etapa: "novo" });
  });
  it("recusa sem nome ou sem DDD", () => {
    expect(parseLead({ nome: "Jo", numero: "47999990000" })).toEqual({ erro: "informe o nome" });
    expect(parseLead({ nome: "João", numero: "99990000" })).toEqual({ erro: "informe o WhatsApp com DDD" });
  });
});

describe("parseNivel", () => {
  it("aceita só os cinco níveis", () => {
    expect(parseNivel({ numero: "+55 47 99999-0000", nivel: "pos" })).toEqual({ numero: "5547999990000", nivel: "pos" });
    expect(parseNivel({ numero: "1", nivel: "doutorado" })).toBeNull();
    expect(parseNivel({ numero: "", nivel: "eja" })).toBeNull();
  });
  it("lead manual guarda o nível escolhido", () => {
    expect(parseLead({ nome: "Ana Paula", numero: "47999990000", nivel: "mestrado" })).toMatchObject({ nivel: "mestrado" });
    expect(parseLead({ nome: "Ana Paula", numero: "47999990000", nivel: "x" })).toMatchObject({ nivel: "" });
  });
});

describe("quem inicia o atendimento", () => {
  it("Aurora inicia exige explicar como o lead chegou", () => {
    expect(parseLead({ nome: "Vivian Souza", numero: "91991851877", inicia: "aurora" })).toEqual({ erro: "explique para a Aurora como esse lead chegou" });
    expect(parseLead({ nome: "Vivian Souza", numero: "91991851877", inicia: "aurora", contexto: "  chamou no acadêmico  " })).toMatchObject({
      inicia: "aurora",
      contexto: "chamou no acadêmico",
    });
  });
  it("padrão é a Thalia e o contexto é ignorado", () => {
    expect(parseLead({ nome: "Ana Paula", numero: "47999990000", contexto: "qualquer coisa" })).toMatchObject({ inicia: "thalia", contexto: "" });
  });
  it("lead já matriculado nunca é chamado pela Aurora", () => {
    expect(parseLead({ nome: "Ana Paula", numero: "47999990000", etapa: "matriculado", inicia: "aurora" })).toMatchObject({ inicia: "thalia" });
  });
});

describe("parseChat", () => {
  it("aceita mensagem e limpa espaços", () => {
    expect(parseChat({ texto: "  quantos leads hoje?  " })).toEqual({ texto: "quantos leads hoje?" });
  });
  it("recusa vazio", () => {
    expect(parseChat({ texto: " " })).toEqual({ erro: "escreva a mensagem" });
    expect(parseChat(null)).toEqual({ erro: "dados inválidos" });
  });
});
