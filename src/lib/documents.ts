import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { systemDocument } from "./billing";

type Exec = Pick<typeof db, "execute">;

/**
 * Próximo nº automático da empresa (A00001, A00002…). O contador sobe numa única instrução atômica,
 * então dois lançamentos ao mesmo tempo nunca recebem o mesmo número.
 */
export async function nextDocument(companyId: number, tx: Exec = db): Promise<string> {
  const r = await tx.execute<{ ultimo: number }>(sql`
    insert into sequencias_documento (empresa_id, ultimo) values (${companyId}, 1)
    on conflict (empresa_id) do update set ultimo = sequencias_documento.ultimo + 1
    returning ultimo`);
  return systemDocument(Number(r.rows[0].ultimo));
}

/** Só para mostrar no formulário qual número o próximo lançamento deve receber (o definitivo sai ao salvar). */
export async function peekDocument(companyId: number): Promise<string> {
  const r = await db.execute<{ ultimo: number }>(sql`select ultimo from sequencias_documento where empresa_id = ${companyId}`);
  return systemDocument(Number(r.rows[0]?.ultimo ?? 0) + 1);
}
