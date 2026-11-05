CREATE TYPE "public"."tipo_conta" AS ENUM('caixa', 'banco', 'carteira');--> statement-breakpoint
CREATE TYPE "public"."papel" AS ENUM('leitura', 'lancador', 'gestor');--> statement-breakpoint
CREATE TYPE "public"."origem" AS ENUM('manual', 'chserver');--> statement-breakpoint
CREATE TYPE "public"."natureza_transferencia" AS ENUM('emprestimo', 'devolucao', 'aporte', 'transferencia');--> statement-breakpoint
CREATE TYPE "public"."tipo_lancamento" AS ENUM('entrada', 'saida');--> statement-breakpoint
CREATE TABLE "contas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_conta" DEFAULT 'banco' NOT NULL,
	"saldo_inicial" bigint DEFAULT 0 NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "log_alteracoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" integer,
	"usuario_nome" text,
	"empresa_id" integer,
	"acao" text NOT NULL,
	"entidade" text NOT NULL,
	"entidade_id" text,
	"antes" jsonb,
	"depois" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"nome" text NOT NULL,
	"cor" text DEFAULT '#2563eb' NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "empresas_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "acessos" (
	"usuario_id" integer NOT NULL,
	"empresa_id" integer NOT NULL,
	"papel" "papel" NOT NULL,
	CONSTRAINT "acessos_usuario_id_empresa_id_pk" PRIMARY KEY("usuario_id","empresa_id")
);
--> statement-breakpoint
CREATE TABLE "execucoes_integracao" (
	"id" serial PRIMARY KEY NOT NULL,
	"origem" text NOT NULL,
	"iniciado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone,
	"ok" boolean,
	"mensagem" text,
	"criados" integer DEFAULT 0 NOT NULL,
	"atualizados" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "lancamentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"conta_id" integer NOT NULL,
	"tipo" "tipo_lancamento" NOT NULL,
	"descricao" text NOT NULL,
	"categoria_id" integer,
	"cliente_fornecedor" text,
	"valor" bigint NOT NULL,
	"vencimento" date NOT NULL,
	"pago_em" date,
	"observacoes" text,
	"transferencia_id" uuid,
	"grupo_recorrencia" uuid,
	"origem" "origem" DEFAULT 'manual' NOT NULL,
	"id_externo" text,
	"categoria_externa" text,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"natureza" "natureza_transferencia" NOT NULL,
	"empresa_origem_id" integer NOT NULL,
	"empresa_destino_id" integer NOT NULL,
	"valor" bigint NOT NULL,
	"data" date NOT NULL,
	"descricao" text NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text NOT NULL,
	"admin" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"tentativas_falhas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"trocar_senha" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_login" timestamp with time zone,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "contas" ADD CONSTRAINT "contas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_alteracoes" ADD CONSTRAINT "log_alteracoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_alteracoes" ADD CONSTRAINT "log_alteracoes_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos" ADD CONSTRAINT "acessos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos" ADD CONSTRAINT "acessos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_empresa_origem_id_empresas_id_fk" FOREIGN KEY ("empresa_origem_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_empresa_destino_id_empresas_id_fk" FOREIGN KEY ("empresa_destino_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "log_em_idx" ON "log_alteracoes" USING btree ("em");--> statement-breakpoint
CREATE INDEX "log_empresa_idx" ON "log_alteracoes" USING btree ("empresa_id");--> statement-breakpoint
CREATE INDEX "sessoes_usuario_idx" ON "sessoes" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "lancamentos_empresa_venc_idx" ON "lancamentos" USING btree ("empresa_id","vencimento");--> statement-breakpoint
CREATE INDEX "lancamentos_transferencia_idx" ON "lancamentos" USING btree ("transferencia_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_externo_uidx" ON "lancamentos" USING btree ("origem","id_externo");