// Cria as empresas, contas e categorias iniciais. Pode rodar mais de uma vez sem duplicar.
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { accounts, categories, companies } from "../src/db/schema";

const EMPRESAS = [
  { slug: "primetech-loja", name: "Primetech Loja", color: "#2563eb", sortOrder: 1 },
  { slug: "aura-educa", name: "Aura Educa", color: "#7c3aed", sortOrder: 2 },
  { slug: "primetech-sistemas", name: "PrimeTech Sistemas", color: "#059669", sortOrder: 3 },
];

const CONTAS = [
  { name: "Caixa físico", kind: "caixa" as const },
  { name: "Banco", kind: "banco" as const },
];

const CATEGORIAS: Record<string, { entrada: string[]; saida: string[] }> = {
  "primetech-loja": {
    entrada: ["Vendas", "Serviços técnicos"],
    saida: ["Fornecedores / mercadorias", "Aluguel", "Salários", "Impostos", "Taxas de cartão", "Despesas gerais"],
  },
  "aura-educa": {
    entrada: ["Mensalidades", "Matrículas"],
    saida: ["Repasse às instituições", "Comissões", "Aluguel", "Salários", "Marketing", "Despesas gerais"],
  },
  "primetech-sistemas": {
    entrada: ["Mensalidades de sistemas", "Consultoria", "Implantação"],
    saida: ["Licenças de fornecedores", "Comissões", "Salários", "Impostos", "Despesas gerais"],
  },
};

async function main() {
  for (const e of EMPRESAS) {
    let [c] = await db.select().from(companies).where(eq(companies.slug, e.slug));
    if (!c) [c] = await db.insert(companies).values(e).returning();
    for (const conta of CONTAS) {
      const [exists] = await db
        .select()
        .from(accounts)
        .where(and(eq(accounts.companyId, c.id), eq(accounts.name, conta.name)));
      if (!exists) await db.insert(accounts).values({ ...conta, companyId: c.id });
    }
    const cats = CATEGORIAS[e.slug];
    for (const type of ["entrada", "saida"] as const) {
      for (const name of cats[type]) {
        const [exists] = await db
          .select()
          .from(categories)
          .where(and(eq(categories.companyId, c.id), eq(categories.name, name)));
        if (!exists) await db.insert(categories).values({ companyId: c.id, name, type });
      }
    }
  }
  console.log("Empresas, contas e categorias iniciais prontas.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
