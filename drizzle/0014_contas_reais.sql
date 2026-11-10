CREATE TABLE "formas_pagamento_contas" (
	"empresa_id" integer NOT NULL,
	"forma" text NOT NULL,
	"conta_id" integer NOT NULL,
	"dias" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formas_pagamento_contas_empresa_id_forma_pk" PRIMARY KEY("empresa_id","forma")
);
--> statement-breakpoint
ALTER TABLE "config_integracao" ADD COLUMN "conta_pagos_id" integer;--> statement-breakpoint
ALTER TABLE "formas_pagamento_contas" ADD CONSTRAINT "formas_pagamento_contas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formas_pagamento_contas" ADD CONSTRAINT "formas_pagamento_contas_conta_id_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_integracao" ADD CONSTRAINT "config_integracao_conta_pagos_id_contas_id_fk" FOREIGN KEY ("conta_pagos_id") REFERENCES "public"."contas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Contas reais de cada empresa: "Banco" vira o banco principal e "Caixa físico" vira "Dinheiro" (o histórico fica na mesma conta).
UPDATE contas c SET nome = v.novo FROM empresas e, (VALUES ('primetech-loja', 'Banco', 'Cresol'), ('aura-educa', 'Banco', 'Cresol'), ('primetech-sistemas', 'Banco', 'Cora'),
  ('primetech-loja', 'Caixa físico', 'Dinheiro'), ('aura-educa', 'Caixa físico', 'Dinheiro'), ('primetech-sistemas', 'Caixa físico', 'Dinheiro')) AS v(slug, antigo, novo)
WHERE e.id = c.empresa_id AND e.slug = v.slug AND c.nome = v.antigo
  AND NOT EXISTS (SELECT 1 FROM contas o WHERE o.empresa_id = c.empresa_id AND o.nome = v.novo);
--> statement-breakpoint
INSERT INTO contas (empresa_id, nome, tipo)
SELECT e.id, v.nome, 'banco' FROM empresas e, (VALUES ('PagBank'), ('Infinity TH'), ('Ton RO')) AS v(nome)
WHERE e.slug = 'primetech-loja' AND NOT EXISTS (SELECT 1 FROM contas o WHERE o.empresa_id = e.id AND o.nome = v.nome);
