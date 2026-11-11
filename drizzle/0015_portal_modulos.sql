CREATE TYPE "public"."acesso_aura" AS ENUM('ver', 'mover');--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "acesso_aura" "acesso_aura";