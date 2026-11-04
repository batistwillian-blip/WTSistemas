"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, budgets, categories, companies, transactions } from "@/db/schema";
import { getPersonal } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { nextDocument } from "@/lib/documents";
import { isValidIsoDate } from "@/lib/format";
import { matchCategory, UNSPECIFIED } from "@/lib/personal-import";
import { guard, int, money, str, UserError, type ActionState } from "@/lib/form";

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

/**
 * Lança de uma vez os gastos conferidos na tela "Importar gastos": já pagos, na conta pessoal escolhida.
 * Categoria sem correspondência vai para "Não especificado" (criada se faltar).
 * Gasto igual (mesma data, valor e descrição) que já está lançado é pulado, para não duplicar se clicar duas vezes.
 */
export async function importExpenses(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const user = await requireUser();
    const personal = await getPersonal(user);
    if (!personal) throw new UserError("Ative a área Pessoal primeiro.");
    const accountId = int(fd, "accountId");
    const [account] = accountId
      ? await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.companyId, personal.id), eq(accounts.viaCompany, false)))
      : [];
    if (!account) throw new UserError("Escolha a conta pessoal de onde saiu o dinheiro.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(str(fd, "rows", 200_000));
    } catch {
      throw new UserError("Lista inválida. Clique em Conferir de novo.");
    }
    if (!Array.isArray(parsed) || parsed.length === 0) throw new UserError("Nenhum gasto para lançar.");
    if (parsed.length > 500) throw new UserError("No máximo 500 gastos por vez.");
    const rows = parsed.map((r, i) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const date = typeof o.date === "string" && isValidIsoDate(o.date) ? o.date : null;
      const amount = typeof o.amount === "number" && Number.isSafeInteger(o.amount) && o.amount > 0 && o.amount <= 100_000_000_00 ? o.amount : null;
      const description = typeof o.description === "string" ? o.description.trim().slice(0, 200) : "";
      const category = typeof o.category === "string" ? o.category.trim().slice(0, 100) : "";
      if (!date || !amount || !description) throw new UserError(`Linha ${i + 1}: confira data, valor e descrição.`);
      return { date, amount, description, category };
    });

    const result = await db.transaction(async (tx) => {
      // Um import por vez nesta área: dois cliques seguidos não lançam em dobro.
      await tx.execute(sql`select pg_advisory_xact_lock(424245, ${personal.id})`);
      const cats = await tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(and(eq(categories.companyId, personal.id), eq(categories.type, "saida")));
      let unspecified = matchCategory(cats, UNSPECIFIED);
      const catFor = async (name: string) => {
        const found = name ? matchCategory(cats, name) : undefined;
        if (found) return found.id;
        if (!unspecified) {
          const [c] = await tx.insert(categories).values({ companyId: personal.id, name: UNSPECIFIED, type: "saida" }).returning({ id: categories.id, name: categories.name });
          cats.push(c);
          unspecified = c;
        }
        return unspecified.id;
      };
      const dates = rows.map((r) => r.date).sort();
      const existing = await tx
        .select({ date: transactions.dueDate, amount: transactions.amount, description: transactions.description })
        .from(transactions)
        .where(
          and(
            eq(transactions.companyId, personal.id),
            eq(transactions.type, "saida"),
            isNull(transactions.deletedAt),
            sql`${transactions.dueDate} between ${dates[0]} and ${dates[dates.length - 1]}`,
          ),
        );
      const key = (d: string, a: number, s: string) => `${d}|${a}|${s.trim().toLowerCase()}`;
      const seen = new Set(existing.map((e) => key(e.date, e.amount, e.description)));
      const ids: number[] = [];
      let skipped = 0;
      for (const r of rows) {
        if (seen.has(key(r.date, r.amount, r.description))) {
          skipped++;
          continue;
        }
        const categoryId = await catFor(r.category);
        const [t] = await tx
          .insert(transactions)
          .values({
            companyId: personal.id,
            accountId: account.id,
            type: "saida",
            description: r.description,
            amount: r.amount,
            dueDate: r.date,
            competence: `${r.date.slice(0, 7)}-01`,
            paidAt: r.date,
            categoryId,
            document: await nextDocument(personal.id, tx),
            createdBy: user.id,
          })
          .returning({ id: transactions.id });
        ids.push(t.id);
      }
      if (ids.length) {
        await logChange(
          {
            user,
            companyId: personal.id,
            action: "criar",
            entity: "lancamento",
            entityId: ids.join(","),
            after: { importacao: ids.length, conta: account.name, total: rows.reduce((s, r) => s + r.amount, 0), pulados: skipped },
          },
          tx,
        );
      }
      return { created: ids.length, skipped };
    });
    revalidatePath("/", "layout");
    const parts = [`${result.created} ${result.created === 1 ? "gasto lançado" : "gastos lançados"}`];
    if (result.skipped) parts.push(`${result.skipped} já estavam lançados e foram pulados`);
    return { ok: `${parts.join("; ")}.` };
  });
}
