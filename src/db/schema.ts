import {
  type AnyPgColumn,
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Valores monetários são sempre guardados em centavos (inteiro) para evitar erro de arredondamento.
const cents = (name: string) => bigint(name, { mode: "number" });

export const roleEnum = pgEnum("papel", ["leitura", "lancador", "gestor"]);
export const accountKindEnum = pgEnum("tipo_conta", ["caixa", "banco", "carteira"]);
export const txTypeEnum = pgEnum("tipo_lancamento", ["entrada", "saida"]);
export const transferNatureEnum = pgEnum("natureza_transferencia", [
  "emprestimo",
  "devolucao",
  "aporte",
  "transferencia",
]);
export const sourceEnum = pgEnum("origem", ["manual", "chserver"]);

export const users = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  name: text("nome").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("senha_hash").notNull(),
  isAdmin: boolean("admin").notNull().default(false),
  active: boolean("ativo").notNull().default(true),
  failedAttempts: integer("tentativas_falhas").notNull().default(0),
  lockedUntil: timestamp("bloqueado_ate", { withTimezone: true }),
  mustChangePassword: boolean("trocar_senha").notNull().default(true),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("ultimo_login", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessoes",
  {
    // Guardamos apenas o hash SHA-256 do token; o token em si fica só no cookie do navegador.
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expira_em", { withTimezone: true }).notNull(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessoes_usuario_idx").on(t.userId)],
);

export const companies = pgTable("empresas", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("nome").notNull(),
  color: text("cor").notNull().default("#2563eb"),
  sortOrder: integer("ordem").notNull().default(0),
});

export const companyAccess = pgTable(
  "acessos",
  {
    userId: integer("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: integer("empresa_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: roleEnum("papel").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })],
);

export const accounts = pgTable("contas", {
  id: serial("id").primaryKey(),
  companyId: integer("empresa_id")
    .notNull()
    .references(() => companies.id),
  name: text("nome").notNull(),
  kind: accountKindEnum("tipo").notNull().default("banco"),
  initialBalance: cents("saldo_inicial").notNull().default(0),
  active: boolean("ativa").notNull().default(true),
});

export const categories = pgTable("categorias", {
  id: serial("id").primaryKey(),
  companyId: integer("empresa_id")
    .notNull()
    .references(() => companies.id),
  name: text("nome").notNull(),
  type: txTypeEnum("tipo").notNull(),
  active: boolean("ativa").notNull().default(true),
});

export const transfers = pgTable("transferencias", {
  id: uuid("id").primaryKey().defaultRandom(),
  nature: transferNatureEnum("natureza").notNull(),
  fromCompanyId: integer("empresa_origem_id")
    .notNull()
    .references(() => companies.id),
  toCompanyId: integer("empresa_destino_id")
    .notNull()
    .references(() => companies.id),
  amount: cents("valor").notNull(),
  date: date("data").notNull(),
  description: text("descricao").notNull(),
  createdBy: integer("criado_por").references(() => users.id),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("excluido_em", { withTimezone: true }),
});

/**
 * Lançamento: entrada ou saída de uma conta de uma empresa.
 * paidAt nulo = pendente (conta a receber / a pagar). Preenchido = realizado.
 * Uma transferência gera dois lançamentos (saída na origem e entrada no destino) ligados por transferId.
 */
export const transactions = pgTable(
  "lancamentos",
  {
    id: serial("id").primaryKey(),
    companyId: integer("empresa_id")
      .notNull()
      .references(() => companies.id),
    accountId: integer("conta_id")
      .notNull()
      .references(() => accounts.id),
    type: txTypeEnum("tipo").notNull(),
    description: text("descricao").notNull(),
    categoryId: integer("categoria_id").references(() => categories.id),
    counterpart: text("cliente_fornecedor"),
    amount: cents("valor").notNull(),
    dueDate: date("vencimento").notNull(),
    paidAt: date("pago_em"),
    notes: text("observacoes"),
    transferId: uuid("transferencia_id").references(() => transfers.id),
    recurrenceGroup: uuid("grupo_recorrencia"),
    source: sourceEnum("origem").notNull().default("manual"),
    externalId: text("id_externo"),
    externalCategory: text("categoria_externa"),
    createdBy: integer("criado_por").references(() => users.id),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("excluido_em", { withTimezone: true }),
    // Importado do CH só para consulta (ex.: contas já pagas): fica no filtro "Pagos", mas não entra no saldo, nos totais nem nos lançamentos.
    offBalance: boolean("fora_do_saldo").notNull().default(false),
    // Baixa: o valor (amount) passa a ser o efetivamente pago = principal + juros − desconto.
    interest: cents("juros").notNull().default(0),
    discount: cents("desconto").notNull().default(0),
    // Valor de face da conta antes do primeiro pagamento parcial (só informativo).
    originalAmount: cents("valor_original"),
    // Pagamento parcial: a parte paga vira um lançamento próprio que aponta para a conta de origem.
    partialOf: integer("parcial_de").references((): AnyPgColumn => transactions.id),
    // "mensal" (conta fixa) ou "parcelada"; sem_fim = conta fixa que o sistema estende sozinho mês a mês.
    recurrence: text("recorrencia"),
    openEnded: boolean("sem_fim").notNull().default(false),
    // Nº da parcela (1, 2, 3…) e total de parcelas; conta fixa sem fim tem parcela mas não total.
    installment: integer("parcela"),
    installments: integer("parcelas"),
    // Nº do documento: "A00001" quando gerado pelo sistema (sequência por empresa); outro valor = NF ou pedido informado.
    document: text("documento"),
    // Mês de competência (guardado como o dia 1 do mês); sem valor, vale o mês do vencimento.
    competence: date("competencia"),
    // Cadastro do cliente/fornecedor; cliente_fornecedor guarda o nome (cópia) para listas e filtros.
    personId: integer("pessoa_id").references((): AnyPgColumn => people.id),
  },
  (t) => [
    index("lancamentos_empresa_venc_idx").on(t.companyId, t.dueDate),
    index("lancamentos_transferencia_idx").on(t.transferId),
    uniqueIndex("lancamentos_externo_uidx").on(t.source, t.externalId),
  ],
);

export const auditLog = pgTable(
  "log_alteracoes",
  {
    id: serial("id").primaryKey(),
    at: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
    userId: integer("usuario_id").references(() => users.id),
    userName: text("usuario_nome"),
    companyId: integer("empresa_id").references(() => companies.id),
    action: text("acao").notNull(),
    entity: text("entidade").notNull(),
    entityId: text("entidade_id"),
    before: jsonb("antes"),
    after: jsonb("depois"),
    ip: text("ip"),
  },
  (t) => [index("log_em_idx").on(t.at), index("log_empresa_idx").on(t.companyId)],
);

export const integrationRuns = pgTable("execucoes_integracao", {
  id: serial("id").primaryKey(),
  source: text("origem").notNull(),
  startedAt: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finalizado_em", { withTimezone: true }),
  ok: boolean("ok"),
  message: text("mensagem"),
  created: integer("criados").notNull().default(0),
  updated: integer("atualizados").notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];

/** Configuração do Integrador BI, preenchida pelo administrador na tela. O token fica cifrado (AES-256-GCM). */
export const integrationSettings = pgTable("config_integracao", {
  source: text("origem").primaryKey(),
  baseUrl: text("endereco").notNull(),
  cnpj: text("cnpj").notNull(),
  companyKey: text("chave_empresa").notNull(),
  tokenEncrypted: text("token_cifrado").notNull(),
  companyId: integer("empresa_id")
    .notNull()
    .references(() => companies.id),
  accountId: integer("conta_id")
    .notNull()
    .references(() => accounts.id),
  enabled: boolean("ativa").notNull().default(true),
  importReceivables: boolean("importar_receber").notNull().default(true),
  importPayables: boolean("importar_pagar").notNull().default(true),
  importSales: boolean("importar_vendas").notNull().default(true),
  // O saldo é lançado à mão (saldo inicial). Pagamentos e vendas do CH só mexem no saldo se marcados, e a partir de balanceFrom.
  paidAffectBalance: boolean("pagas_no_saldo").notNull().default(false),
  salesAffectBalance: boolean("vendas_no_saldo").notNull().default(false),
  balanceFrom: date("saldo_desde"),
  // Quando o histórico de vendas de 12 meses já foi trazido (uma vez); depois só os últimos dias são relidos.
  salesBackfilledAt: timestamp("vendas_historico_em", { withTimezone: true }),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer("atualizado_por").references(() => users.id),
});

/** Vendas (notas de saída) importadas do CHServer, só para consulta. O total do dia vira uma entrada no caixa. */
export const sales = pgTable(
  "vendas",
  {
    id: serial("id").primaryKey(),
    companyId: integer("empresa_id")
      .notNull()
      .references(() => companies.id),
    externalId: text("id_externo").notNull().unique(),
    number: text("numero"),
    date: date("data").notNull(),
    time: text("hora"),
    customer: text("cliente"),
    total: cents("total").notNull(),
    returned: cents("devolvido").notNull().default(0),
    discount: cents("desconto").notNull().default(0),
    status: text("situacao"),
    model: text("modelo"),
    payment: jsonb("forma_pagamento"),
    items: jsonb("itens"),
    canceled: boolean("cancelada").notNull().default(false),
    updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("excluido_em", { withTimezone: true }),
  },
  (t) => [index("vendas_empresa_data_idx").on(t.companyId, t.date)],
);

/** Códigos de recuperação de senha (uso único). Guardamos só o hash SHA-256; o código aparece uma vez para o usuário. */
export const recoveryCodes = pgTable(
  "codigos_recuperacao",
  {
    id: serial("id").primaryKey(),
    userId: integer("usuario_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("codigo_hash").notNull(),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("usado_em", { withTimezone: true }),
  },
  (t) => [index("codigos_usuario_idx").on(t.userId)],
);

/** Última numeração automática de documento (A00001, A00002…) usada em cada empresa. */
export const documentSequences = pgTable("sequencias_documento", {
  companyId: integer("empresa_id")
    .primaryKey()
    .references(() => companies.id),
  last: integer("ultimo").notNull().default(0),
});

/**
 * Clientes e fornecedores de cada empresa. Código próprio por tipo (C00001 para clientes, F00001 para fornecedores).
 * Só o nome é obrigatório; documento (CPF/CNPJ), contato e PIX são opcionais.
 */
export const people = pgTable(
  "pessoas",
  {
    id: serial("id").primaryKey(),
    companyId: integer("empresa_id")
      .notNull()
      .references(() => companies.id),
    kind: text("tipo").notNull(), // "cliente" | "fornecedor"
    code: text("codigo").notNull(),
    name: text("nome").notNull(),
    taxId: text("cpf_cnpj"),
    phone: text("telefone"),
    email: text("email"),
    pix: text("pix"),
    address: text("endereco"),
    notes: text("observacoes"),
    active: boolean("ativo").notNull().default(true),
    createdBy: integer("criado_por").references(() => users.id),
    createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pessoas_codigo_uidx").on(t.companyId, t.code),
    uniqueIndex("pessoas_nome_uidx").on(t.companyId, t.kind, sql`lower(${t.name})`),
  ],
);

/** Última numeração de cliente (C) e de fornecedor (F) usada em cada empresa. */
export const personSequences = pgTable(
  "sequencias_pessoa",
  {
    companyId: integer("empresa_id")
      .notNull()
      .references(() => companies.id),
    kind: text("tipo").notNull(),
    last: integer("ultimo").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.kind] })],
);
