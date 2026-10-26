"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { requireCompanyId } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { addMonths, today } from "@/lib/format";
import { guard, int, isoDate, money, optStr, str, UserError, type ActionState } from "@/lib/form";

async function loadEditable(id: number) {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
  if (!tx) throw new UserError("Lançamento não encontrado.");
  if (tx.transferId) throw new UserError("Este lançamento faz parte de uma transferência. Altere em Entre empresas.");
  return tx;
}

export async function saveTransaction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const companyId = int(fd, "companyId");
    if (!companyId) throw new UserError("Empresa inválida.");
    const { user } = await requireCompanyId(companyId, "lancar");

    const id = int(fd, "id");
    const type = str(fd, "type");
    if (type !== "entrada" && type !== "saida") throw new UserError("Escolha entrada ou saída.");
    const description = str(fd, "description", 200);
    if (!description) throw new UserError("Informe a descrição.");
    const amount = money(fd, "amount");
    if (amount === null || amount <= 0) throw new UserError("Informe um valor maior que zero.");
    const dueDate = isoDate(fd, "dueDate");
    if (!dueDate) throw new UserError("Informe a data de vencimento.");
    const paid = fd.get("paid") === "on";
    const paidAt = paid ? (isoDate(fd, "paidAt") ?? today()) : null;

    const accountId = int(fd, "accountId");
    const [account] = accountId
      ? await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)))
      : [];
    if (!account) throw new UserError("Escolha uma conta desta empresa.");

    const categoryId = int(fd, "categoryId");
    if (categoryId) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.companyId, companyId)));
      if (!cat) throw new UserError("Categoria inválida.");
    }

    const values = {
      type: type as "entrada" | "saida",
      description,
      amount,
      dueDate,
      paidAt,
      accountId: account.id,
      categoryId: categoryId ?? null,
      counterpart: optStr(fd, "counterpart", 150),
      notes: optStr(fd, "notes", 1000),
    };

    if (id) {
      const before = await loadEditable(id);
      if (before.companyId !== companyId) throw new UserError("Lançamento não pertence a esta empresa.");
      if (before.source !== "manual") throw new UserError("Lançamentos importados do sistema de vendas não podem ser editados aqui.");
      const [after] = await db
        .update(transactions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(transactions.id, id))
        .returning();
      await logChange({ user, companyId, action: "editar", entity: "lancamento", entityId: id, before, after });
    } else {
      const repeat = Math.min(Math.max(int(fd, "repeat") ?? 1, 1), 36);
      const group = repeat > 1 ? randomUUID() : null;
      const rows = Array.from({ length: repeat }, (_, i) => ({
        ...values,
        companyId,
        dueDate: addMonths(dueDate, i),
        // Só a primeira ocorrência pode nascer paga; as próximas ficam pendentes.
        paidAt: i === 0 ? paidAt : null,
        recurrenceGroup: group,
        createdBy: user.id,
      }));
      const created = await db.insert(transactions).values(rows).returning();
      await logChange({
        user,
        companyId,
        action: "criar",
        entity: "lancamento",
        entityId: created.map((c) => c.id).join(","),
        after: repeat > 1 ? { ...created[0], ocorrencias: repeat } : created[0],
      });
    }
    revalidatePath("/", "layout");
    return { ok: id ? "Lançamento atualizado." : "Lançamento salvo." };
  });
}

export async function setPaid(fd: FormData) {
  const id = int(fd, "id");
  if (!id) return;
  const [before] = await db.select().from(transactions).where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
  if (!before) return;
  const { user } = await requireCompanyId(before.companyId, "lancar");
  if (before.source !== "manual") return;
  const paidAt = fd.get("undo") === "1" ? null : (isoDate(fd, "paidAt") ?? today());
  // Transferência: os dois lados mudam juntos.
  const where = before.transferId ? eq(transactions.transferId, before.transferId) : eq(transactions.id, id);
  if (before.transferId) {
    const sides = await db.select().from(transactions).where(where);
    for (const s of sides) await requireCompanyId(s.companyId, "lancar");
  }
  const after = await db.update(transactions).set({ paidAt, updatedAt: new Date() }).where(where).returning();
  await logChange({
    user,
    companyId: before.companyId,
    action: paidAt ? "baixar" : "estornar_baixa",
    entity: "lancamento",
    entityId: after.map((a) => a.id).join(","),
    before: { paidAt: before.paidAt },
    after: { paidAt },
  });
  revalidatePath("/", "layout");
}

export async function deleteTransaction(fd: FormData) {
  const id = int(fd, "id");
  if (!id) return;
  const before = await loadEditable(id);
  const { user } = await requireCompanyId(before.companyId, "gerir");
  if (before.source !== "manual") return;
  const scope = str(fd, "scope");
  // "futuras" exclui esta e as próximas ocorrências pendentes da mesma recorrência.
  const rows =
    scope === "futuras" && before.recurrenceGroup
      ? await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.recurrenceGroup, before.recurrenceGroup), isNull(transactions.deletedAt), isNull(transactions.paidAt)))
          .then((r) => r.filter((t) => t.dueDate >= before.dueDate))
      : [before];
  const now = new Date();
  for (const r of rows) {
    await db.update(transactions).set({ deletedAt: now }).where(eq(transactions.id, r.id));
  }
  await logChange({
    user,
    companyId: before.companyId,
    action: "excluir",
    entity: "lancamento",
    entityId: rows.map((r) => r.id).join(","),
    before: rows.length === 1 ? before : { ...before, ocorrencias: rows.length },
  });
  revalidatePath("/", "layout");
}
