// Preparação do banco ao subir o servidor: aplica migrações, cria empresas/contas/categorias iniciais
// e, se ainda não houver nenhum usuário, cria o primeiro administrador a partir de ADMIN_EMAIL e ADMIN_SENHA_INICIAL.
// Tudo é idempotente: rodar de novo não duplica nada.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hash } from "@node-rs/argon2";
import pg from "pg";

const EMPRESAS = [
  {
    slug: "primetech-loja",
    nome: "Primetech Loja",
    cor: "#2563eb",
    ordem: 1,
    entrada: ["Vendas", "Serviços técnicos"],
    saida: ["Fornecedores / mercadorias", "Aluguel", "Salários", "Impostos", "Taxas de cartão", "Despesas gerais"],
  },
  {
    slug: "aura-educa",
    nome: "Aura Educa",
    cor: "#7c3aed",
    ordem: 2,
    entrada: ["Mensalidades", "Matrículas"],
    saida: ["Repasse às instituições", "Comissões", "Aluguel", "Salários", "Marketing", "Despesas gerais"],
  },
  {
    slug: "primetech-sistemas",
    nome: "PrimeTech Sistemas",
    cor: "#059669",
    ordem: 3,
    entrada: ["Mensalidades de sistemas", "Consultoria", "Implantação"],
    saida: ["Licenças de fornecedores", "Comissões", "Salários", "Impostos", "Despesas gerais"],
  },
];

const CONTAS = [
  { nome: "Caixa físico", tipo: "caixa" },
  { nome: "Banco", tipo: "banco" },
];

async function seed(client) {
  for (const e of EMPRESAS) {
    await client.query(
      "insert into empresas (slug, nome, cor, ordem) values ($1, $2, $3, $4) on conflict (slug) do nothing",
      [e.slug, e.nome, e.cor, e.ordem],
    );
    const { rows } = await client.query("select id from empresas where slug = $1", [e.slug]);
    const id = rows[0].id;
    for (const c of CONTAS) {
      await client.query(
        "insert into contas (empresa_id, nome, tipo) select $1, $2, $3 where not exists (select 1 from contas where empresa_id = $1 and nome = $2)",
        [id, c.nome, c.tipo],
      );
    }
    for (const tipo of ["entrada", "saida"]) {
      for (const nome of e[tipo]) {
        await client.query(
          "insert into categorias (empresa_id, nome, tipo) select $1, $2, $3 where not exists (select 1 from categorias where empresa_id = $1 and nome = $2)",
          [id, nome, tipo],
        );
      }
    }
  }
}

async function firstAdmin(client) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA_INICIAL;
  const { rows } = await client.query("select count(*)::int as n from usuarios");
  if (rows[0].n > 0) return;
  if (!email || !senha) {
    console.log("Nenhum usuário ainda. Defina ADMIN_EMAIL e ADMIN_SENHA_INICIAL para criar o primeiro administrador.");
    return;
  }
  if (senha.length < 10) throw new Error("ADMIN_SENHA_INICIAL precisa ter pelo menos 10 caracteres.");
  const senhaHash = await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await client.query(
    "insert into usuarios (nome, email, senha_hash, admin, trocar_senha) values ($1, $2, $3, true, true)",
    [process.env.ADMIN_NOME || email.split("@")[0], email, senhaHash],
  );
  console.log(`Primeiro administrador criado: ${email}. A senha terá de ser trocada no primeiro acesso.`);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const client = await pool.connect();
  try {
    await seed(client);
    await firstAdmin(client);
  } finally {
    client.release();
  }
  console.log("Banco pronto.");
} finally {
  await pool.end();
}
