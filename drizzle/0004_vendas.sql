CREATE TABLE "vendas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"id_externo" text NOT NULL,
	"numero" text,
	"data" date NOT NULL,
	"hora" text,
	"cliente" text,
	"total" bigint NOT NULL,
	"devolvido" bigint DEFAULT 0 NOT NULL,
	"desconto" bigint DEFAULT 0 NOT NULL,
	"situacao" text,
	"modelo" text,
	"forma_pagamento" jsonb,
	"itens" jsonb,
	"cancelada" boolean DEFAULT false NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"excluido_em" timestamp with time zone,
	CONSTRAINT "vendas_id_externo_unique" UNIQUE("id_externo")
);
--> statement-breakpoint
ALTER TABLE "config_integracao" ADD COLUMN "importar_vendas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vendas_empresa_data_idx" ON "vendas" USING btree ("empresa_id","data");--> statement-breakpoint
-- O contas a receber do CH não é usado: desliga de vez.
UPDATE "config_integracao" SET "importar_receber" = false;
