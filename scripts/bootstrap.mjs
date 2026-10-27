// Preparação do banco ao subir o servidor: aplica migrações, cria empresas/contas/categorias iniciais
// e, se ainda não houver nenhum usuário, cria o primeiro administrador a partir de ADMIN_EMAIL e ADMIN_SENHA_INICIAL.
// Tudo é idempotente: rodar de novo não duplica nada.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createHmac } from "node:crypto";
import { hash } from "@node-rs/argon2";
import pg from "pg";

const EMPRESAS = [
  {
    slug: "primetech-loja",
    nome: "Primetech Loja",
    cor: "#C06C17",
    ordem: 1,
    entrada: ["Vendas", "Serviços técnicos"],
    saida: ["Fornecedores / mercadorias", "Aluguel", "Salários", "Impostos", "Taxas de cartão", "Despesas gerais"],
  },
  {
    slug: "aura-educa",
    nome: "Aura Educa",
    cor: "#4950B3",
    ordem: 2,
    entrada: ["Mensalidades", "Matrículas"],
    saida: ["Repasse às instituições", "Comissões", "Aluguel", "Salários", "Marketing", "Despesas gerais"],
  },
  {
    slug: "primetech-sistemas",
    nome: "PrimeTech Sistemas",
    cor: "#A03876",
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
      "insert into empresas (slug, nome, cor, ordem) values ($1, $2, $3, $4) on conflict (slug) do update set cor = excluded.cor",
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

/**
 * Reset de emergência (quem tem acesso à hospedagem): com ADMIN_RESET_SENHA definida, troca a senha de ADMIN_RESET_EMAIL
 * (ou ADMIN_EMAIL) por ela, desbloqueia, derruba as sessões e obriga a trocar no próximo login. Vale uma vez por valor:
 * a marca fica no log (só uma impressão digital, nunca a senha), então reiniciar o servidor não reseta de novo.
 */
async function emergencyReset(client) {
  const senha = process.env.ADMIN_RESET_SENHA;
  if (!senha) return;
  const email = (process.env.ADMIN_RESET_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (!email) return console.log("ADMIN_RESET_SENHA definida, mas falta ADMIN_RESET_EMAIL ou ADMIN_EMAIL.");
  const mark = createHmac("sha256", process.env.DATABASE_URL || "").update(`${email}\n${senha}`).digest("hex").slice(0, 32);
  const done = await client.query("select 1 from log_alteracoes where acao = 'reset_senha_emergencia' and entidade_id = $1", [mark]);
  if (done.rowCount) return console.log("Reset de emergência já aplicado antes; nada a fazer. Pode apagar ADMIN_RESET_SENHA.");
  const { rows } = await client.query("select id from usuarios where email = $1", [email]);
  if (!rows[0]) return console.log(`Reset de emergência: usuário ${email} não encontrado.`);
  const senhaHash = await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await client.query(
    "update usuarios set senha_hash = $1, trocar_senha = true, tentativas_falhas = 0, bloqueado_ate = null, ativo = true where id = $2",
    [senhaHash, rows[0].id],
  );
  await client.query("delete from sessoes where usuario_id = $1", [rows[0].id]);
  await client.query(
    "insert into log_alteracoes (usuario_nome, acao, entidade, entidade_id, depois) values ('Servidor', 'reset_senha_emergencia', 'usuario', $1, $2)",
    [mark, JSON.stringify({ email, usuarioId: rows[0].id })],
  );
  console.log(`Senha de ${email} resetada pela variável ADMIN_RESET_SENHA; troca obrigatória no próximo login. Apague a variável.`);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  const client = await pool.connect();
  try {
    await seed(client);
    await firstAdmin(client);
    await emergencyReset(client);
  } finally {
    client.release();
  }
  console.log("Banco pronto.");
} finally {
  await pool.end();
}
