ALTER TABLE "config_integracao" ADD COLUMN "pagas_no_saldo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_integracao" ADD COLUMN "vendas_no_saldo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "config_integracao" ADD COLUMN "saldo_desde" date;