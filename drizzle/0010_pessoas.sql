CREATE TABLE "pessoas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"cpf_cnpj" text,
	"telefone" text,
	"email" text,
	"pix" text,
	"endereco" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sequencias_pessoa" (
	"empresa_id" integer NOT NULL,
	"tipo" text NOT NULL,
	"ultimo" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sequencias_pessoa_empresa_id_tipo_pk" PRIMARY KEY("empresa_id","tipo")
);
--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "pessoa_id" integer;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_criado_por_usuarios_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequencias_pessoa" ADD CONSTRAINT "sequencias_pessoa_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pessoas_codigo_uidx" ON "pessoas" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "pessoas_nome_uidx" ON "pessoas" USING btree ("empresa_id","tipo",lower("nome"));--> statement-breakpoint
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Quem já aparece nos lançamentos (cliente ou fornecedor só pelo nome) ganha cadastro com código e fica ligado.
WITH missing AS (
  SELECT DISTINCT ON (l.empresa_id, k.tipo, lower(trim(l.cliente_fornecedor)))
    l.empresa_id, k.tipo, trim(l.cliente_fornecedor) AS nome
  FROM lancamentos l
  CROSS JOIN LATERAL (SELECT CASE WHEN l.tipo = 'entrada' THEN 'cliente' ELSE 'fornecedor' END AS tipo) k
  WHERE l.excluido_em IS NULL AND l.transferencia_id IS NULL
    AND trim(coalesce(l.cliente_fornecedor, '')) <> ''
    AND coalesce(l.id_externo, '') NOT LIKE 'vendas:%'
  ORDER BY l.empresa_id, k.tipo, lower(trim(l.cliente_fornecedor)), l.id
), numbered AS (
  SELECT m.*, row_number() OVER (PARTITION BY m.empresa_id, m.tipo ORDER BY lower(m.nome)) AS n FROM missing m
)
INSERT INTO pessoas (empresa_id, tipo, codigo, nome)
SELECT empresa_id, tipo, (CASE WHEN tipo = 'cliente' THEN 'C' ELSE 'F' END) || lpad(n::text, 5, '0'), nome FROM numbered;
--> statement-breakpoint
INSERT INTO sequencias_pessoa (empresa_id, tipo, ultimo)
SELECT empresa_id, tipo, max(substring(codigo FROM 2)::int) FROM pessoas GROUP BY empresa_id, tipo;
--> statement-breakpoint
UPDATE lancamentos l SET pessoa_id = p.id, cliente_fornecedor = p.nome
FROM pessoas p
WHERE l.pessoa_id IS NULL AND p.empresa_id = l.empresa_id
  AND p.tipo = CASE WHEN l.tipo = 'entrada' THEN 'cliente' ELSE 'fornecedor' END
  AND lower(p.nome) = lower(trim(l.cliente_fornecedor));
