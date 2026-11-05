import Link from "next/link";
import { notFound } from "next/navigation";
import { activatePersonal } from "@/app/actions/pessoal";
import { PageHead } from "@/components/PageHead";
import { getPersonal } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { addDays, addMonths, formatDate, formatMoney, monthEnd, today } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";
import { personalBudgets, personalCategories, personalRows } from "@/lib/personal";
import { budgetStatus, bySourceCompany, monthSummary } from "@/lib/personal-calc";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const title = (m: string) => {
  const n = MONTHS[Number(m.slice(5, 7)) - 1];
  return `${n[0].toUpperCase()}${n.slice(1)} de ${m.slice(0, 4)}`;
};

// Valor curto para caber embaixo das barras no celular: "R$ 4,6 mil".
const compact = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

/** Área Pessoal: o mês do sócio — renda, gastos por categoria contra o orçamento, o que saiu de cada empresa e os últimos 6 meses. */
export default async function PessoalPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const personal = await getPersonal(user);
  if (!personal) {
    if (!user.isAdmin) notFound();
    return (
      <div className="stack">
        <PageHead context="Pessoal" title="Minha área pessoal" />
        <div className="card stack" style={{ maxWidth: 680 }}>
          <p style={{ margin: 0 }}>
            Lance seus gastos pessoais por categoria, diga de qual empresa saiu o dinheiro e acompanhe quanto gasta por mês, com orçamento e meta de reserva.
          </p>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Só você vê. Não entra no Consolidado das empresas.</li>
            <li>Gasto pago com dinheiro de uma empresa vira, lá, uma &quot;Retirada do sócio&quot; (sem o detalhe do gasto).</li>
            <li>Já vem com contas (Conta pessoal, Dinheiro) e categorias, que você pode mudar em Ajustes.</li>
          </ul>
          <form action={activatePersonal}>
            <button className="btn primary" type="submit">
              Ativar minha área pessoal
            </button>
          </form>
        </div>
      </div>
    );
  }

  const sp = await searchParams;
  const d0 = today();
  const mes = param(sp, "mes");
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : d0.slice(0, 7);
  const from = `${month}-01`;
  const to = monthEnd(from);
  const first6 = addMonths(from, -5);
  const base = `/empresa/${personal.slug}`;
  const [rows6, budgets, cats, upcoming] = await Promise.all([
    personalRows(personal.id, first6, to),
    personalBudgets(personal.id),
    personalCategories(personal.id),
    personalRows(personal.id, d0, addDays(d0, 30)),
  ]);
  const rows = rows6.filter((r) => r.dueDate >= from);
  const sum = monthSummary(rows);
  const names = new Map(cats.map((c) => [c.id, c.name]));
  const status = budgetStatus(rows, budgets, names);
  const alerts = status.filter((s) => s.level === "warn" || s.level === "over");
  const sources = bySourceCompany(rows);
  const maxCat = Math.max(1, ...status.map((s) => Math.max(s.total, s.budget ?? 0)));
  const goal = personal.reserveGoal;
  const history = Array.from({ length: 6 }, (_, i) => {
    const m = addMonths(first6, i).slice(0, 7);
    return { month: m, ...monthSummary(rows6.filter((r) => r.dueDate.startsWith(m))) };
  });
  const maxHist = Math.max(1, ...history.flatMap((h) => [h.income, h.spent]));
  const next = upcoming.filter((r) => r.type === "saida" && !r.paidAt).slice(0, 6);
  const prev = addMonths(from, -1).slice(0, 7);
  const nextM = addMonths(from, 1).slice(0, 7);
  const lastMonth = history[4];

  return (
    <div className="stack">
      <PageHead
        context="Pessoal"
        color={personal.color}
        title="Meu mês"
        subtitle="Só você vê esta área. Ela não entra no Consolidado das empresas."
        action={{ href: `${base}/lancamentos/novo`, label: "+ Novo gasto" }}
      />
      <div className="bills-bar">
        <div className="month-nav">
          <Link className="btn sm" href={`/pessoal?mes=${prev}`} aria-label="Mês anterior">
            ‹
          </Link>
          <h2>{title(month)}</h2>
          <Link className="btn sm" href={`/pessoal?mes=${nextM}`} aria-label="Próximo mês">
            ›
          </Link>
          {month !== d0.slice(0, 7) && (
            <Link className="btn sm" href="/pessoal">
              Mês atual
            </Link>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn sm" href={`${base}/lancamentos/novo?tipo=entrada&retirada=1`} title="Dinheiro que você tirou de uma empresa para a conta pessoal">
            + Retirada da empresa
          </Link>
          <Link className="btn sm" href={`${base}/lancamentos/novo?tipo=entrada`}>
            + Nova renda
          </Link>
          <Link className="btn sm" href="/pessoal/importar">
            Importar gastos
          </Link>
          <Link className="btn sm" href="/pessoal/orcamento">
            Orçamento e meta
          </Link>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alert error" style={{ display: "grid", gap: 4 }}>
          {alerts.map((a) => (
            <span key={a.name}>
              <b>{a.name}</b>: {formatMoney(a.total)} de {formatMoney(a.budget!)} ({a.pct}% do orçamento)
              {a.level === "over" ? ", estourou." : ", atenção."}
            </span>
          ))}
        </div>
      )}

      <div className="grid k4">
        <div className="card kpi">
          <span className="label">Renda do mês</span>
          <span className="value pos">{formatMoney(sum.income)}</span>
          <span className="sub">
            Retiradas e outras rendas {formatMoney(sum.ownIncome)}
            {sum.viaCompany > 0 && <> · gastos pagos pelas empresas {formatMoney(sum.viaCompany)}</>}
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Gastos do mês</span>
          <span className="value neg">{formatMoney(sum.spent)}</span>
          <span className="sub">
            Pago {formatMoney(sum.spentPaid)} · a pagar {formatMoney(sum.spentOpen)}
            {lastMonth.spent > 0 && month === d0.slice(0, 7) && (
              <>
                {" "}
                · mês passado {formatMoney(lastMonth.spent)}
              </>
            )}
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Sobra</span>
          <span className={`value ${sum.left < 0 ? "neg" : "pos"}`}>{formatMoney(sum.left)}</span>
          <span className="sub">
            {sum.savedPct === null ? "Lance sua renda para ver quanto sobra" : `${sum.savedPct}% da renda`}
            {goal ? ` · meta ${goal}%` : ""}
            {goal && sum.savedPct !== null ? (sum.savedPct >= goal ? " ✓" : ` · faltam ${formatMoney(Math.max(0, Math.round((sum.income * goal) / 100) - sum.left))}`) : ""}
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Saiu das empresas</span>
          <span className="value">{formatMoney(sources.reduce((s, c) => s + c.total, 0))}</span>
          <span className="sub">Retiradas e gastos pagos por elas</span>
        </div>
      </div>

      <div className="grid main-side">
        <div className="card">
          <div className="panel-h">
            <h2>Para onde foi o dinheiro</h2>
            <Link className="small" href="/pessoal/orcamento">
              Definir orçamento
            </Link>
          </div>
          {status.length === 0 && (
            <p className="muted">
              Nenhum gasto neste mês. <Link href={`${base}/lancamentos/novo`}>Lançar um gasto</Link>
            </p>
          )}
          <div className="budget-bars">
            {status.map((c) => (
              <Link key={c.name} href={`${base}/pagar?mes=${month}${c.id ? `&categoria=${encodeURIComponent(c.name)}` : ""}`} className={c.level ?? undefined}>
                <span className="cb-top">
                  <span>{c.name}</span>
                  <span className="num">
                    {formatMoney(c.total)}
                    {c.budget !== null && <span className="muted"> / {formatMoney(c.budget)}</span>}
                  </span>
                </span>
                <span className="cb-bar">
                  <span style={{ width: `${Math.min(100, Math.max(1, Math.round((c.total / (c.budget ?? maxCat)) * 100)))}%` }} />
                </span>
                <span className="small muted">
                  {c.pct !== null ? `${c.pct}% do orçamento` : sum.spent ? `${Math.round((c.total / sum.spent) * 100)}% dos gastos` : ""}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="panel-h">
              <h2>Saiu de cada empresa</h2>
            </div>
            {sources.length === 0 ? (
              <p className="muted small">Nada pago com dinheiro das empresas neste mês.</p>
            ) : (
              <div className="list">
                {sources.map((s) => (
                  <div key={s.name} className="li" style={{ gridTemplateColumns: "1fr auto" }}>
                    <span className="emp">
                      <span className="dot" style={{ background: s.color }} />
                      {s.name} <span className="small muted">({s.n})</span>
                    </span>
                    <b className="num">{formatMoney(s.total)}</b>
                  </div>
                ))}
              </div>
            )}
            <p className="help" style={{ marginBottom: 0 }}>
              Na empresa aparece como &quot;Retirada do sócio&quot;, sem o detalhe do gasto.
            </p>
          </div>
          <div className="card">
            <div className="panel-h">
              <h2>Próximas contas</h2>
              <Link className="small" href={`${base}/pagar`}>
                Ver todas
              </Link>
            </div>
            {next.length === 0 ? (
              <p className="muted small">Nada a pagar nos próximos 30 dias.</p>
            ) : (
              <div className="list">
                {next.map((r) => (
                  <div key={r.id} className="li" style={{ gridTemplateColumns: "auto 1fr auto" }}>
                    <span className="small muted num">{formatDate(r.dueDate).slice(0, 5)}</span>
                    <span>
                      {r.description}
                      {r.sourceCompany && <span className="small muted"> · {r.sourceCompany}</span>}
                    </span>
                    <b className="num neg">{formatMoney(r.amount)}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="panel-h">
          <h2>Últimos 6 meses</h2>
          <span className="small muted">
            <span className="legend in" /> renda <span className="legend out" /> gastos
          </span>
        </div>
        <div className="hist6">
          {history.map((h) => (
            <Link key={h.month} href={`/pessoal?mes=${h.month}`} className={h.month === month ? "on" : undefined}>
              <span className="hist-bars">
                <span className="in" style={{ height: `${Math.round((h.income / maxHist) * 100)}%` }} title={`Renda ${formatMoney(h.income)}`} />
                <span className="out" style={{ height: `${Math.round((h.spent / maxHist) * 100)}%` }} title={`Gastos ${formatMoney(h.spent)}`} />
              </span>
              <b>{SHORT[Number(h.month.slice(5, 7)) - 1]}</b>
              <span className={`small num ${h.left < 0 ? "neg" : ""}`} title={formatMoney(h.left)}>
                {compact(h.left)}
              </span>
            </Link>
          ))}
        </div>
        <p className="help" style={{ marginBottom: 0 }}>
          Pelo vencimento, pagos e a pagar. Abaixo de cada mês, quanto sobrou (renda − gastos).
        </p>
      </div>
    </div>
  );
}
