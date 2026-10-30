"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, seasonalTips } from "@/db/schema";
import { requireCompanyId } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { guard, int, money, str, UserError, type ActionState } from "@/lib/form";

export async function saveAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const companyId = int(fd, "companyId");
    if (!companyId) throw new UserError("Empresa inválida.");
    const { user } = await requireCompanyId(companyId, "gerir");
    const name = str(fd, "name", 80);
    if (!name) throw new UserError("Informe o nome da conta.");
    const kind = str(fd, "kind");
    if (kind !== "caixa" && kind !== "banco" && kind !== "carteira") throw new UserError("Tipo de conta inválido.");
    const initialBalance = money(fd, "initialBalance") ?? 0;
    const active = fd.get("active") !== "off";
    const id = int(fd, "id");
    if (id) {
      const [before] = await db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.companyId, companyId)));
      if (!before) throw new UserError("Conta não encontrada.");
      const [after] = await db
        .update(accounts)
        .set({ name, kind, initialBalance, active })
        .where(eq(accounts.id, id))
        .returning();
      await logChange({ user, companyId, action: "editar", entity: "conta", entityId: id, before, after });
    } else {
      const [after] = await db.insert(accounts).values({ companyId, name, kind, initialBalance }).returning();
      await logChange({ user, companyId, action: "criar", entity: "conta", entityId: after.id, after });
    }
    revalidatePath("/", "layout");
    return { ok: "Conta salva." };
  });
}

export async function saveCategory(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const companyId = int(fd, "companyId");
    if (!companyId) throw new UserError("Empresa inválida.");
    const { user } = await requireCompanyId(companyId, "gerir");
    const name = str(fd, "name", 80);
    if (!name) throw new UserError("Informe o nome da categoria.");
    const type = str(fd, "type");
    if (type !== "entrada" && type !== "saida") throw new UserError("Tipo inválido.");
    const [after] = await db.insert(categories).values({ companyId, name, type }).returning();
    await logChange({ user, companyId, action: "criar", entity: "categoria", entityId: after.id, after });
    revalidatePath("/", "layout");
    return { ok: "Categoria criada." };
  });
}

export async function toggleCategory(fd: FormData) {
  const id = int(fd, "id");
  if (!id) return;
  const [before] = await db.select().from(categories).where(eq(categories.id, id));
  if (!before) return;
  const { user } = await requireCompanyId(before.companyId, "gerir");
  const [after] = await db.update(categories).set({ active: !before.active }).where(eq(categories.id, id)).returning();
  await logChange({ user, companyId: before.companyId, action: "editar", entity: "categoria", entityId: id, before, after });
  revalidatePath("/", "layout");
}

/** Dica de sazonalidade da empresa (nova ou editada). */
export async function saveTip(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const companyId = int(fd, "companyId");
    if (!companyId) throw new UserError("Empresa inválida.");
    const { user } = await requireCompanyId(companyId, "gerir");
    const month = int(fd, "month");
    if (!month || month < 1 || month > 12) throw new UserError("Escolha o mês.");
    const title = str(fd, "title", 120);
    const text = str(fd, "text", 600);
    if (!title || !text) throw new UserError("Informe o título e o texto da dica.");
    const id = int(fd, "id");
    if (id) {
      const [before] = await db.select().from(seasonalTips).where(and(eq(seasonalTips.id, id), eq(seasonalTips.companyId, companyId)));
      if (!before) throw new UserError("Dica não encontrada.");
      const [after] = await db.update(seasonalTips).set({ month, title, text }).where(eq(seasonalTips.id, id)).returning();
      await logChange({ user, companyId, action: "editar", entity: "dica", entityId: id, before, after });
    } else {
      const [after] = await db.insert(seasonalTips).values({ companyId, month, title, text }).returning();
      await logChange({ user, companyId, action: "criar", entity: "dica", entityId: after.id, after });
    }
    revalidatePath("/", "layout");
    return { ok: "Dica salva." };
  });
}

export async function toggleTip(fd: FormData) {
  const id = int(fd, "id");
  if (!id) return;
  const [before] = await db.select().from(seasonalTips).where(eq(seasonalTips.id, id));
  if (!before) return;
  const { user } = await requireCompanyId(before.companyId, "gerir");
  const [after] = await db.update(seasonalTips).set({ active: !before.active }).where(eq(seasonalTips.id, id)).returning();
  await logChange({ user, companyId: before.companyId, action: "editar", entity: "dica", entityId: id, before, after });
  revalidatePath("/", "layout");
}
