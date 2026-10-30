import type { CompanyWithRole } from "@/lib/access";
import { addMonths, formatDate, formatMoney, monthEnd, monthStart } from "@/lib/format";
import { monthsBetween, previousPeriod, type Period } from "@/lib/period";
import { categoryTotals, consultationTotals, monthlyTotals, realizedTotals } from "@/lib/queries";
import { BarChart } from "./BarChart";
import { PeriodFilter } from "./PeriodFilter";

function change(now: number, before: number) {
  if (!before) return null;
  const pct = ((now - before) / Math.abs(before)) * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% vs. período anterior`;
}

/** Relatório do realizado (o que entrou e saiu do saldo) no período, por mês, por categoria e, no consolidado, por empresa. */
export async function ReportsView({ companies, consolidated, period }: { companies: CompanyWithRole[]; consolidated: boolean; period: Period }) {
  const ids = companies.map((c) => c.id);
  const prev = previousPeriod(period);
  // Gráfico: 12 meses terminando no fim do período escolhido.
  const chartFrom = addMonths(monthStart(period.to), -11);
  const [now, before, monthly, cats, consult, ...perCompany] = await Promise.all([
    realizedTotals(ids, period.from, period.to),
    realizedTotals(ids, prev.from, prev.to),
    monthlyTotals(ids, chartFrom, monthEnd(period.to)),
    categoryTotals(ids, period.from, period.to),
    consultationTotals(ids, period.from, period.to),
    ...(consolidated ? companies.map((c) => realizedTotals([c.id], period.from, period.to)) : []),
  ]);
  const months = monthsBetween(chartFrom, period.to);
  const byMonth = new Map(monthly.map((m) => [m.month, m]));
  const result = now.inflow - now.outflow;
  const resultBefore = before.inflow - before.outflow;

  const catTable = (type: "entrada" | "saida", title: string) => {
    const rows = cats.filter((c) => c.type === type);
    const total = rows.reduce((s, r) => s + r.total, 0);
    return (
      <div className="card table-wrap">
        <div className="panel-h">
          <h2>{title}</h2>
          <b className={`num ${type === "entrada" ? "pos" : "neg"}`}>{formatMoney(total)}</b>
        </div>
        {rows.length === 0 ? (
          <p className="muted">Nada no período.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Lançamentos</th>
                <th className="num">Valor</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{formatMoney(r.total)}</td>
                  <td className="num muted">{total ? ((r.total / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  return (
    <div className="stack">
      <PeriodFilter period={period} />
      <p className="help">
        Realizado de {formatDate(period.from)} a {formatDate(period.to)}: só o que entrou e saiu do saldo. Transferências entre as empresas não contam como
        receita nem despesa.
      </p>
      <div className="grid k3">
        <div className="card kpi">
          <span className="label">Entradas</span>
          <span className="value pos">{formatMoney(now.inflow)}</span>
          <span className="sub">{change(now.inflow, before.inflow) ?? "sem período anterior para comparar"}</span>
        </div>
        <div className="card kpi">
          <span className="label">Saídas</span>
          <span className="value neg">{formatMoney(now.outflow)}</span>
          <span className="sub">{change(now.outflow, before.outflow) ?? "sem período anterior para comparar"}</span>
        </div>
        <div className="card kpi hero">
          <span className="label">Resultado</span>
          <span className="value">{formatMoney(result)}</span>
          <span className="sub">Período anterior: {formatMoney(resultBefore)}</span>
        </div>
      </div>
      <div className="card">
        <h2>Entradas e saídas por mês</h2>
        <BarChart
          labels={months}
          highlight={months.indexOf(period.to.slice(0, 7))}
          series={[
            { name: "Entradas", color: "var(--in)", values: months.map((m) => byMonth.get(m)?.inflow ?? 0) },
            { name: "Saídas", color: "var(--out)", values: months.map((m) => byMonth.get(m)?.outflow ?? 0) },
          ]}
        />
      </div>
      {consolidated && (
        <div className="card table-wrap">
          <h2>Por empresa</h2>
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th className="num">Entradas</th>
                <th className="num">Saídas</th>
                <th className="num">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c, i) => {
                const t = perCompany[i];
                return (
                  <tr key={c.id}>
                    <td>
                      <span className="dot" style={{ background: c.color, display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 6 }} />
                      {c.name}
                    </td>
                    <td className="num pos">{formatMoney(t.inflow)}</td>
                    <td className="num neg">{formatMoney(t.outflow)}</td>
                    <td className={`num ${t.inflow - t.outflow < 0 ? "neg" : ""}`}>{formatMoney(t.inflow - t.outflow)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid k2" style={{ alignItems: "start" }}>
        {catTable("entrada", "Entradas por categoria")}
        {catTable("saida", "Saídas por categoria")}
      </div>
      {consult.length > 0 && (
        <div className="card table-wrap">
          <div className="panel-h">
            <h2>Pagas no CHServer (só consulta)</h2>
            <b className="num">{formatMoney(consult.reduce((s, r) => s + r.total, 0))}</b>
          </div>
          <p className="help" style={{ marginBottom: 8 }}>
            Contas pagas registradas no CH no período. Não somam no caixa nem nos números acima; servem só para acompanhar.
          </p>
          <table>
            <thead>
              <tr>
                <th>Categoria no CH</th>
                <th className="num">Contas</th>
                <th className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {consult.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num">{r.n}</td>
                  <td className="num">{formatMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
