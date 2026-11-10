CREATE TABLE "config_integracao" (
	"origem" text PRIMARY KEY NOT NULL,
	"endereco" text NOT NULL,
	"cnpj" text NOT NULL,
	"chave_empresa" text NOT NULL,
	"token_cifrado" text NOT NULL,
	"empresa_id" integer NOT NULL,
	"conta_id" integer NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_por" integer
);
--> statement-breakpoint
ALTER TABLE "config_integracao" ADD CONSTRAINT "config_integracao_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_integracao" ADD CONSTRAINT "config_integracao_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_integracao" ADD CONSTRAINT "config_integracao_atualizado_por_usuarios_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;