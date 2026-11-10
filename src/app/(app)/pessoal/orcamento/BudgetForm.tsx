"use client";

import { useState } from "react";
import { saveBudget } from "@/app/actions/pessoal";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { formatMoney, parseMoney } from "@/lib/format";

export function BudgetForm({
  categories,
  reserveGoal,
  categoriesHref,
}: {
  categories: { id: number; name: string; budget: string; avg: string }[];
  reserveGoal: number | null;
  categoriesHref: string;
}) {
  const [values, setValues] = useState(() => Object.fromEntries(categories.map((c) => [c.id, c.budget])));
  const total = Object.values(values).reduce((s, v) => s + (parseMoney(v) ?? 0), 0);
  return (
    <ActionForm action={saveBudget} className="form card">
      <p className="help" style={{ margin: 0 }}>
        Quanto você quer gastar por mês em cada categoria. Em branco = sem limite. Em Meu mês o sistema avisa quando passar de 80% e de 100%. Para ajudar, ao lado aparece a
        média dos últimos 3 meses.
      </p>
      <div className="budget-form">
        <span className="h">Categoria</span>
        <span className="h">Orçamento/mês (R$)</span>
        <span className="h avg">Média 3 meses</span>
        {categories.map((c) => (
          <div key={c.id} style={{ display: "contents" }}>
            <label htmlFor={`b_${c.id}`}>{c.name}</label>
            <input
              id={`b_${c.id}`}
              name={`b_${c.id}`}
              inputMode="decimal"
              placeholder="sem limite"
              value={values[c.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [c.id]: e.target.value }))}
            />
            <span className="small muted num avg">{c.avg}</span>
          </div>
        ))}
        <b>Total do orçamento</b>
        <b className="num">{formatMoney(total)}</b>
        <span className="avg" />
      </div>
      <div className="fields">
        <label>
          Meta de reserva (% da renda que quer guardar)
          <input name="reserveGoal" type="number" min={0} max={100} defaultValue={reserveGoal ?? ""} />
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Faltou uma categoria? <a href={categoriesHref}>Crie em Ajustes</a>.
      </p>
      <div>
        <Submit>Salvar orçamento</Submit>
      </div>
    </ActionForm>
  );
}
