"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, budgets, categories, companies } from "@/db/schema";
import { getPersonal } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { guard, int, money, UserError, type ActionState } from "@/lib/form";

const GASTOS = [
  "Moradia (aluguel/financiamento)",
  "Contas da casa (luz, água, internet)",
  "Mercado",
  "Restaurantes e delivery",
  "Transporte e combustível",
  "Saúde e farmácia",
  "Plano de saúde",
  "Educação e escola",
  "Filhos",
  "Lazer e viagens",
  "Roupas",
  "Cuidados pessoais",
  "Dízimo e ofertas",
  "Assinaturas",
  "Cartão de crédito",
  "Presentes",
  "Impostos e taxas",
  "Reserva e investimentos",
  "Outros gastos",
];
const RENDAS = ["Pró-labore", "Retirada das empresas", "Outras rendas", "Rendimentos"];

/** Ativa a área Pessoal do usuário: "empresa" particular com contas e categorias prontas. Só administradores (sócios). */
export async function activatePersonal() {
  const user = await requireUser();
  if (!user.isAdmin) throw new Error("Sem permissão.");
  if (await getPersonal(user)) redirect("/pessoal");
  await db.transaction(async (tx) => {
    // Um por usuário, mesmo com dois cliques seguidos.
    await tx.execute(sql`select pg_advisory_xact_lock(424244, ${user.id})`);
    const [exists] = await tx.select({ id: companies.id }).from(companies).where(eq(companies.ownerId, user.id));
    if (exists) return;
    const [c] = await tx
      .insert(companies)
      .values({ slug: `pessoal-${user.id}`, name: "Pessoal", color: "#0f766e", sortOrder: 999, ownerId: user.id, reserveGoal: 10 })
      .returning();
    await tx.insert(accounts).values([
      { companyId: c.id, name: "Conta pessoal", kind: "banco" },
      { companyId: c.id, name: "Dinheiro", kind: "carteira" },
      { companyId: c.id, name: "Pago pelas empresas", kind: "carteira", viaCompany: true },
    ]);
    await tx.insert(categories).values([
      ...GASTOS.map((name) => ({ companyId: c.id, name, type: "saida" as const })),
      ...RENDAS.map((name) => ({ companyId: c.id, name, type: "entrada" as const })),
    ]);
    await logChange({ user, companyId: c.id, action: "criar", entity: "area_pessoal", entityId: c.id }, tx);
  });
  revalidatePath("/", "layout");
  redirect("/pessoal");
}

/** Orçamento mensal por categoria de gasto e meta de reserva (% da renda). Vazio = sem limite. */
export async function saveBudget(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const personal = await getPersonal(user);
    if (!personal) throw new UserError("Ative a área Pessoal primeiro.");
    const cats = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.companyId, personal.id), eq(categories.type, "saida")));
    const rows: { companyId: number; categoryId: number; amount: number }[] = [];
    for (const c of cats) {
      const v = money(fd, `b_${c.id}`);
      if (v === null || v <= 0) continue;
      if (v > 100_000_000_00) throw new UserError("Valor alto demais.");
      rows.push({ companyId: personal.id, categoryId: c.id, amount: v });
    }
    const goal = int(fd, "reserveGoal");
    if (goal !== null && (goal < 0 || goal > 100)) throw new UserError("A meta de reserva vai de 0 a 100%.");
    await db.transaction(async (tx) => {
      await tx.delete(budgets).where(eq(budgets.companyId, personal.id));
      if (rows.length) await tx.insert(budgets).values(rows);
      await tx.update(companies).set({ reserveGoal: goal }).where(eq(companies.id, personal.id));
      await logChange({ user, companyId: personal.id, action: "editar", entity: "orcamento", entityId: personal.id, after: { categorias: rows.length, metaReserva: goal } }, tx);
    });
    revalidatePath("/pessoal");
    return { ok: "Orçamento salvo." };
  });
}
