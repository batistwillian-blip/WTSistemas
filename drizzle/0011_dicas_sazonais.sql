CREATE TABLE "dicas_sazonais" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"mes" integer NOT NULL,
	"titulo" text NOT NULL,
	"texto" text NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dicas_sazonais" ADD CONSTRAINT "dicas_sazonais_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dicas_empresa_mes_idx" ON "dicas_sazonais" USING btree ("empresa_id","mes");