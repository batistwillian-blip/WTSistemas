import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { linkPeopleSql, personPrefix } from "./people-sql";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Mesma chave de lock para tudo que numera pessoas: evita dois cadastros com o mesmo código.
const LOCK = sql`select pg_advisory_xact_lock(424243)`;

/** Próximo código do tipo (C00001, F00001…) na empresa; deve rodar dentro de uma transação. */
async function nextCode(tx: Tx, companyId: number, kind: string) {
  const r = await tx.execute<{ ultimo: number }>(sql`
    insert into sequencias_pessoa (empresa_id, tipo, ultimo) values (${companyId}, ${kind}, 1)
    on conflict (empresa_id, tipo) do update set ultimo = sequencias_pessoa.ultimo + 1
    returning ultimo`);
  return personPrefix(kind) + String(Number(r.rows[0].ultimo)).padStart(5, "0");
}

export type PersonInput = {
  name: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  pix?: string | null;
  address?: string | null;
  notes?: string | null;
};

/** Cria o cadastro (com código) ou devolve o que já existe com o mesmo nome e tipo. */
export async function findOrCreatePerson(companyId: number, kind: string, input: PersonInput, userId: number | null) {
  return db.transaction(async (tx) => {
    await tx.execute(LOCK);
    const [found] = await tx
      .select()
      .from(people)
      .where(and(eq(people.companyId, companyId), eq(people.kind, kind), sql`lower(${people.name}) = lower(${input.name})`));
    if (found) return { person: found, created: false };
    const code = await nextCode(tx, companyId, kind);
    const [person] = await tx
      .insert(people)
      .values({ companyId, kind, code, createdBy: userId, ...input })
      .returning();
    return { person, created: true };
  });
}

/** Cadastra e liga quem só aparece pelo nome nos lançamentos (ex.: fornecedores vindos do CHServer). */
export async function linkPeople(companyIds?: number[]) {
  await db.transaction(async (tx) => {
    await tx.execute(LOCK);
    for (const q of linkPeopleSql(companyIds)) await tx.execute(q);
  });
}
