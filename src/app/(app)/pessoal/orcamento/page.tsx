import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/PageHead";
import { getPersonal } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { addMonths, formatMoney, monthEnd, today } from "@/lib/format";
import { personalBudgets, personalCategories, personalRows } from "@/lib/personal";
import { BudgetForm } from "./BudgetForm";

/** Orçamento mensal por categoria de gasto e meta de reserva, com a média dos últimos 3 meses para ajudar a definir. */
export default async function OrcamentoPage() {
  const user = await requireUser();
  const personal = await getPersonal(user);
  if (!personal) redirect("/pessoal");
  const d0 = today();
  const from = addMonths(d0.slice(0, 8) + "01", -3);
  const to = monthEnd(addMonths(d0.slice(0, 8) + "01", -1));
  const [cats, budgets, rows] = await Promise.all([personalCategories(personal.id), personalBudgets(personal.id), personalRows(personal.id, from, to)]);
  const avg = new Map<number, number>();
  for (const r of rows) if (r.type === "saida" && r.categoryId) avg.set(r.categoryId, (avg.get(r.categoryId) ?? 0) + r.amount);
  const limit = new Map(budgets.map((b) => [b.categoryId, b.amount]));
  return (
    <div className="stack">
      <PageHead
        context="Pessoal"
        color={personal.color}
        title="Orçamento e meta de reserva"
        subtitle={<Link href="/pessoal">← Voltar para Meu mês</Link>}
      />
      <BudgetForm
        reserveGoal={personal.reserveGoal}
        categories={cats
          .filter((c) => c.active || limit.has(c.id))
          .map((c) => ({
            id: c.id,
            name: c.name,
            budget: limit.has(c.id) ? (limit.get(c.id)! / 100).toFixed(2).replace(".", ",") : "",
            avg: avg.has(c.id) ? formatMoney(Math.round(avg.get(c.id)! / 3)) : "—",
          }))}
        categoriesHref={`/empresa/${personal.slug}/ajustes`}
      />
    </div>
  );
}
