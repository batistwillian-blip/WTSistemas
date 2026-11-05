"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { people, transactions } from "@/db/schema";
import { requireCompanyId } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { guard, int, optStr, str, UserError, type ActionState } from "@/lib/form";
import { findOrCreatePerson } from "@/lib/people";
import { normalizeTaxId } from "@/lib/people-sql";

function readPerson(fd: FormData) {
  const name = str(fd, "name", 150);
  if (!name) throw new UserError("Informe o nome.");
  const tax = normalizeTaxId(str(fd, "taxId", 30));
  if ("error" in tax) throw new UserError(tax.error);
  const email = optStr(fd, "email", 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("E-mail inválido.");
  return {
    name,
    taxId: tax.value,
    phone: optStr(fd, "phone", 40),
    email,
    pix: optStr(fd, "pix", 150),
    address: optStr(fd, "address", 300),
    notes: optStr(fd, "notes", 1000),
  };
}

/** Cadastro de cliente/fornecedor. Só o nome é obrigatório; o código (C/F + sequência) é dado pelo sistema. */
export async function savePerson(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const companyId = int(fd, "companyId");
    if (!companyId) throw new UserError("Empresa inválida.");
    const { user } = await requireCompanyId(companyId, "lancar");
    const data = readPerson(fd);
    const id = int(fd, "id");
    if (id) {
      const [before] = await db.select().from(people).where(and(eq(people.id, id), eq(people.companyId, companyId)));
      if (!before) throw new UserError("Cadastro não encontrado.");
      const [clash] = await db
        .select({ id: people.id, code: people.code })
        .from(people)
        .where(and(eq(people.companyId, companyId), eq(people.kind, before.kind), sql`lower(${people.name}) = lower(${data.name})`, sql`${people.id} <> ${id}`));
      if (clash) throw new UserError(`Já existe outro cadastro com esse nome (${clash.code}).`);
      const active = fd.get("active") !== "off";
      const [after] = await db.update(people).set({ ...data, active }).where(eq(people.id, id)).returning();
      // O nome nas contas acompanha o cadastro.
      if (after.name !== before.name) await db.update(transactions).set({ counterpart: after.name }).where(eq(transactions.personId, id));
      await logChange({ user, companyId, action: "editar", entity: "pessoa", entityId: id, before, after });
      revalidatePath("/", "layout");
      return { ok: "Cadastro atualizado." };
    }
    const kind = str(fd, "kind");
    if (kind !== "cliente" && kind !== "fornecedor") throw new UserError("Escolha cliente ou fornecedor.");
    const { person, created } = await findOrCreatePerson(companyId, kind, data, user.id);
    if (!created) throw new UserError(`Já existe ${kind === "cliente" ? "um cliente" : "um fornecedor"} com esse nome (${person.code}).`);
    await logChange({ user, companyId, action: "criar", entity: "pessoa", entityId: person.id, after: person });
    revalidatePath("/", "layout");
    return { ok: `Cadastro ${person.code} criado.` };
  });
}
