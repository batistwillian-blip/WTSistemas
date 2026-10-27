CREATE TABLE "codigos_recuperacao" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"codigo_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usado_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "codigos_recuperacao" ADD CONSTRAINT "codigos_recuperacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codigos_usuario_idx" ON "codigos_recuperacao" USING btree ("usuario_id");