ALTER TABLE "config_integracao" ADD COLUMN "vendas_historico_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "fora_do_saldo" boolean DEFAULT false NOT NULL;