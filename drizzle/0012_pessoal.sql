ALTER TYPE "public"."origem" ADD VALUE 'pessoal';--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"empresa_id" integer NOT NULL,
	"categoria_id" integer NOT NULL,
	"valor" bigint NOT NULL,
	CONSTRAINT "orcamentos_empresa_id_categoria_id_pk" PRIMARY KEY("empresa_id","categoria_id")
);
--> statement-breakpoint
ALTER TABLE "contas" ADD COLUMN "via_empresa" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "categorias" ADD COLUMN "retirada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "dono_id" integer;--> statement-breakpoint
ALTER TABLE "empresas" ADD COLUMN "meta_reserva" integer;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "retirada_conta_id" integer;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "origem_pessoal_id" integer;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_dono_id_usuarios_id_fk" FOREIGN KEY ("dono_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_retirada_conta_id_contas_id_fk" FOREIGN KEY ("retirada_conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_origem_pessoal_id_lancamentos_id_fk" FOREIGN KEY ("origem_pessoal_id") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lancamentos_origem_pessoal_uidx" ON "lancamentos" USING btree ("origem_pessoal_id");--> statement-breakpoint
-- Categorias que já se chamam "Retirada…" passam a contar como retirada do sócio (fora da despesa operacional).
UPDATE "categorias" SET "retirada" = true WHERE "tipo" = 'saida' AND lower("nome") LIKE 'retirada%';
