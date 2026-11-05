ALTER TABLE "lancamentos" ADD COLUMN "juros" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "desconto" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "valor_original" bigint;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "parcial_de" integer;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "recorrencia" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "sem_fim" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_parcial_de_lancamentos_id_fk" FOREIGN KEY ("parcial_de") REFERENCES "public"."lancamentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "lancamentos" SET "recorrencia" = 'mensal' WHERE "grupo_recorrencia" IS NOT NULL AND "transferencia_id" IS NULL;
