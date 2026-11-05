import { sql, type SQL } from "drizzle-orm";

/** Tipo de cadastro conforme o lado da conta: entrada = cliente, saída = fornecedor. */
export const personKindOf = (type: "entrada" | "saida") => (type === "entrada" ? "cliente" : "fornecedor");
export const personPrefix = (kind: string) => (kind === "cliente" ? "C" : "F");

/**
 * Cria o cadastro de quem aparece em lançamentos sem cadastro (só com o nome) e liga os lançamentos a ele.
 * Os códigos continuam a sequência de cada empresa e tipo. Usado após a importação do CHServer e na migração.
 */
export function linkPeopleSql(companyIds?: number[]): SQL[] {
  const scope = companyIds?.length ? sql`and l.empresa_id in (${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)})` : sql``;
  return [
    // A importação pode trocar o fornecedor de um título: solta o vínculo quando o nome não bate mais.
    sql`
      update lancamentos l set pessoa_id = null
      from pessoas p
      where l.pessoa_id = p.id and l.origem = 'chserver'
        and lower(trim(coalesce(l.cliente_fornecedor, ''))) <> lower(p.nome)
        ${scope}`,
    sql`
      with missing as (
        select distinct on (l.empresa_id, k.tipo, lower(trim(l.cliente_fornecedor)))
          l.empresa_id, k.tipo, trim(l.cliente_fornecedor) as nome
        from lancamentos l
        cross join lateral (select case when l.tipo = 'entrada' then 'cliente' else 'fornecedor' end as tipo) k
        where l.pessoa_id is null and l.excluido_em is null and l.transferencia_id is null
          and trim(coalesce(l.cliente_fornecedor, '')) <> ''
          and coalesce(l.id_externo, '') not like 'vendas:%'
          ${scope}
          and not exists (select 1 from pessoas p where p.empresa_id = l.empresa_id and p.tipo = k.tipo and lower(p.nome) = lower(trim(l.cliente_fornecedor)))
        order by l.empresa_id, k.tipo, lower(trim(l.cliente_fornecedor)), l.id
      ), numbered as (
        select m.*, row_number() over (partition by m.empresa_id, m.tipo order by lower(m.nome)) as n from missing m
      )
      insert into pessoas (empresa_id, tipo, codigo, nome)
      select n.empresa_id, n.tipo,
        (case when n.tipo = 'cliente' then 'C' else 'F' end) || lpad((coalesce(s.ultimo, 0) + n.n)::text, 5, '0'),
        n.nome
      from numbered n
      left join sequencias_pessoa s on s.empresa_id = n.empresa_id and s.tipo = n.tipo`,
    sql`
      insert into sequencias_pessoa (empresa_id, tipo, ultimo)
      select empresa_id, tipo, max(substring(codigo from 2)::int) from pessoas group by empresa_id, tipo
      on conflict (empresa_id, tipo) do update set ultimo = greatest(sequencias_pessoa.ultimo, excluded.ultimo)`,
    sql`
      update lancamentos l set pessoa_id = p.id, cliente_fornecedor = p.nome
      from pessoas p
      where l.pessoa_id is null and p.empresa_id = l.empresa_id
        and p.tipo = case when l.tipo = 'entrada' then 'cliente' else 'fornecedor' end
        and lower(p.nome) = lower(trim(l.cliente_fornecedor))
        ${scope}`,
    // Mesmo nome escrito diferente (maiúsculas, espaços): fica igual ao cadastro, para o filtro por fornecedor achar tudo.
    sql`
      update lancamentos l set cliente_fornecedor = p.nome
      from pessoas p
      where l.pessoa_id = p.id and l.cliente_fornecedor is distinct from p.nome
        ${scope}`,
  ];
}

/** CPF (11 dígitos) ou CNPJ (14), aceitando pontos, traço e barra; devolve formatado ou um erro. */
export function normalizeTaxId(input: string): { value: string | null } | { error: string } {
  const digits = input.replace(/\D/g, "");
  if (!digits) return { value: null };
  if (digits.length === 11) return { value: digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") };
  if (digits.length === 14) return { value: digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") };
  return { error: "CPF tem 11 números e CNPJ tem 14." };
}
