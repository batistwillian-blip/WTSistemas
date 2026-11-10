"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions, transfers } from "@/db/schema";
import { requireCompanyId } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { natureLabels, NATURES, type Nature } from "@/lib/labels";
import { guard, int, isoDate, money, str, UserError, type ActionState } from "@/lib/form";


export async function createTransfer(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const fromAccountId = int(fd, "fromAccountId");
    const toAccountId = int(fd, "toAccountId");
    if (!fromAccountId || !toAccountId) throw new UserError("Escolha as contas de origem e destino.");
    if (fromAccountId === toAccountId) throw new UserError("Origem e destino precisam ser contas diferentes.");
    const [from] = await db.select().from(accounts).where(eq(accounts.id, fromAccountId));
    const [to] = await db.select().from(accounts).where(eq(accounts.id, toAccountId));
    if (!from || !to) throw new UserError("Conta inválida.");
    const { user, company: fromCompany } = await requireCompanyId(from.companyId, "lancar");
    const { company: toCompany } = await requireCompanyId(to.companyId, "lancar");

    const nature = str(fd, "nature") as Nature;
    if (!NATURES.includes(nature)) throw new UserError("Escolha a natureza.");
    if (nature !== "transferencia" && from.companyId === to.companyId)
      throw new UserError("Empréstimo, devolução e aporte são entre empresas diferentes.");
    const amount = money(fd, "amount");
    if (amount === null || amount <= 0) throw new UserError("Informe um valor maior que zero.");
    const date = isoDate(fd, "date");
    if (!date) throw new UserError("Informe a data.");
    const paid = fd.get("pending") !== "on";
    const description = str(fd, "description", 200) || natureLabels[nature];

    await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(transfers)
        .values({ nature, fromCompanyId: from.companyId, toCompanyId: to.companyId, amount, date, description, createdBy: user.id })
        .returning();
      const base = { amount, dueDate: date, paidAt: paid ? date : null, transferId: t.id, createdBy: user.id };
      await tx.insert(transactions).values([
        { ...base, companyId: from.companyId, accountId: from.id, type: "saida", description: `${description} → ${toCompany.name}` },
        { ...base, companyId: to.companyId, accountId: to.id, type: "entrada", description: `${description} ← ${fromCompany.name}` },
      ]);
      await logChange(
        {
          user,
          companyId: from.companyId,
          action: "criar",
          entity: "transferencia",
          entityId: t.id,
          after: { ...t, contaOrigem: from.name, contaDestino: to.name, paga: paid },
        },
        tx,
      );
    });
    revalidatePath("/", "layout");
    return { ok: `Transferência de ${fromCompany.name} para ${toCompany.name} registrada.` };
  });
}

export async function deleteTransfer(fd: FormData) {
  const id = str(fd, "id", 40);
  const [t] = await db.select().from(transfers).where(and(eq(transfers.id, id), isNull(transfers.deletedAt)));
  if (!t) return;
  const { user } = await requireCompanyId(t.fromCompanyId, "gerir");
  await requireCompanyId(t.toCompanyId, "gerir");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(transfers).set({ deletedAt: now }).where(eq(transfers.id, id));
    await tx.update(transactions).set({ deletedAt: now }).where(eq(transactions.transferId, id));
    await logChange({ user, companyId: t.fromCompanyId, action: "excluir", entity: "transferencia", entityId: id, before: t }, tx);
  });
  revalidatePath("/", "layout");
}
