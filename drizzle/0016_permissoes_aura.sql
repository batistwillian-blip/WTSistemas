ALTER TABLE "usuarios" ADD COLUMN "permissoes_aura" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
UPDATE "usuarios" SET "permissoes_aura" = CASE "acesso_aura" WHEN 'ver' THEN ARRAY['ver'] WHEN 'mover' THEN ARRAY['ver','mover','ensinar','lead'] ELSE '{}'::text[] END;--> statement-breakpoint
ALTER TABLE "usuarios" DROP COLUMN "acesso_aura";--> statement-breakpoint
DROP TYPE "public"."acesso_aura";
