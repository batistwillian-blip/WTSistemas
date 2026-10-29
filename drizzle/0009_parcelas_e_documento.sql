CREATE TABLE "sequencias_documento" (
	"empresa_id" integer PRIMARY KEY NOT NULL,
	"ultimo" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "parcela" integer;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "parcelas" integer;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "documento" text;--> statement-breakpoint
ALTER TABLE "lancamentos" ADD COLUMN "competencia" date;--> statement-breakpoint
ALTER TABLE "sequencias_documento" ADD CONSTRAINT "sequencias_documento_empresa_id_empresas_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Parcelas das séries já lançadas: número pela ordem de vencimento; total quando a série tem fim.
WITH s AS (
  SELECT id,
    row_number() OVER (PARTITION BY grupo_recorrencia ORDER BY vencimento, id) AS n,
    count(*) OVER (PARTITION BY grupo_recorrencia) AS total,
    bool_or(sem_fim) OVER (PARTITION BY grupo_recorrencia) AS sem_fim
  FROM lancamentos
  WHERE grupo_recorrencia IS NOT NULL AND parcial_de IS NULL AND transferencia_id IS NULL
)
UPDATE lancamentos l SET parcela = s.n, parcelas = CASE WHEN s.sem_fim THEN NULL ELSE s.total END FROM s WHERE s.id = l.id;
--> statement-breakpoint
-- A parcela agora tem campo próprio: tira o " (k/N)" que ia na descrição.
UPDATE lancamentos SET descricao = regexp_replace(descricao, ' \(\d+/\d+\)$', '') WHERE recorrencia = 'parcelada';
--> statement-breakpoint
-- Numeração automática para os lançamentos manuais existentes (uma por conta; parcelas da mesma série dividem o número).
WITH base AS (
  SELECT l.id, l.empresa_id,
    coalesce((SELECT min(x.id) FROM lancamentos x WHERE x.grupo_recorrencia = l.grupo_recorrencia), l.id) AS chave
  FROM lancamentos l
  WHERE l.origem = 'manual' AND l.transferencia_id IS NULL AND l.parcial_de IS NULL AND l.documento IS NULL
), r AS (
  SELECT id, empresa_id, dense_rank() OVER (PARTITION BY empresa_id ORDER BY chave) AS n FROM base
)
UPDATE lancamentos l SET documento = 'A' || lpad(r.n::text, 5, '0') FROM r WHERE r.id = l.id;
--> statement-breakpoint
UPDATE lancamentos c SET documento = p.documento, parcela = p.parcela, parcelas = p.parcelas
FROM lancamentos p WHERE c.parcial_de = p.id;
--> statement-breakpoint
INSERT INTO sequencias_documento (empresa_id, ultimo)
SELECT empresa_id, max(substring(documento FROM 2)::int) FROM lancamentos WHERE documento ~ '^A\d+$' GROUP BY empresa_id;
--> statement-breakpoint
UPDATE lancamentos SET competencia = date_trunc('month', vencimento)::date WHERE competencia IS NULL;
