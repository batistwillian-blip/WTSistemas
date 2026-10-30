import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { project, type Projection } from "@/lib/finance";
import { addDays, addMonths, formatDate, formatMoney, monthEnd, monthStart, today } from "@/lib/format";
import { accountBalances, pendingItems } from "@/lib/queries";
import { LineChart, type Series } from "./LineChart";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export async function ProjectionView({
  companies,
  days,
  basePath,
  consolidated,
}: {
  companies: CompanyWithRole[];
  days: number;
  basePath: string;
  consolidated: boolean;
}) {
  const ids = companies.map((c) => c.id);
  const d0 = today();
  // Calcula até o fim do 3º mês para a tabela de fim de mês, e corta o gráfico no horizonte escolhido.
  const monthEnds = [0, 1, 2].map((i) => monthEnd(addMonths(monthStart(d0), i)));
  const span = Math.max(days, Math.round((Date.parse(monthEnds[2]) - Date.parse(d0)) / 86_400_000));
  const [balances, items] = await Promise.all([accountBalances(ids), pendingItems(ids, addDays(d0, span))]);

  const rows: { key: string; name: string; color: string; start: number; proj: Projection }[] = [];
  const startAll = balances.reduce((s, b) => s + b.balance, 0);
  if (consolidated) rows.push({ key: "all", name: "Consolidado", color: "var(--accent)", start: startAll, proj: project(startAll, items, d0, span) });
  for (const c of companies) {
    const start = balances.filter((b) => b.companyId === c.id).reduce((s, b) => s + b.balance, 0);
    rows.push({ key: String(c.id), name: c.name, color: c.color, start, proj: project(start, items.filter((p) => p.companyId === c.id), d0, span) });
  }
  const main = rows[0];
  const cut = (p: Projection) => p.points.slice(0, days + 1);
  const series: Series[] = rows.map((r, i) => ({
    name: r.name,
    color: r.color,
    width: i === 0 ? 3 : 1.6,
    area: i === 0,
    points: cut(r.proj),
  }));
  const negative = rows.filter((r) => cut(r.proj).some((p) => p.balance < 0) && r.key !== "all");
  const moves = cut(main.proj).filter((p, i) => i === 0 || p.inflow || p.outflow);

  return (
    <div className="stack">
      {negative.map((r) => {
        const first = cut(r.proj).find((p) => p.balance < 0)!;
        return (
          <div className="alert error" key={r.key}>
            <p>
              <b>{r.name}</b> fica com saldo negativo em <b>{formatDate(first.date).slice(0, 5)}</b> ({formatMoney(first.balance)}) se nada mudar.
            </p>
          </div>
        );
      })}
      <div className="card">
        <div className="panel-h">
          <h2>Saldo dia a dia</h2>
          <div className="tabs">
            {[30, 60, 90].map((d) => (
              <Link key={d} href={`${basePath}?dias=${d}`} className={d === days ? "on" : undefined}>
                {d} dias
              </Link>
            ))}
          </div>
        </div>
        <LineChart series={series} />
        <p className="small muted" style={{ marginTop: 12 }}>
          Parte do saldo de hoje e soma tudo o que está lançado como pendente: contas a receber, a pagar e transferências programadas. Contas vencidas
          entram como se fossem quitadas hoje.
        </p>
      </div>
      <div className="card">
        <h2>Saldo previsto no fim de cada mês</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th className="num">Hoje</th>
                {monthEnds.map((m) => (
                  <th key={m} className="num">
                    {MONTHS[Number(m.slice(5, 7)) - 1]}
                  </th>
                ))}
                <th className="num">Menor saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>
                    <span className="emp">
                      <span className="dot" style={{ background: r.color }} />
                      {r.key === "all" ? <b>{r.name}</b> : r.name}
                    </span>
                  </td>
                  <td className="num">{formatMoney(r.start)}</td>
                  {monthEnds.map((m) => {
                    const v = r.proj.points.find((p) => p.date === m)?.balance ?? r.proj.endBalance;
                    return (
                      <td key={m} className={`num ${v < 0 ? "neg" : ""}`}>
                        {formatMoney(v)}
                      </td>
                    );
                  })}
                  <td className={`num ${r.proj.minBalance < 0 ? "neg" : ""}`}>
                    {formatMoney(r.proj.minBalance)} <span className="muted">em {formatDate(r.proj.minDate).slice(0, 5)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <details className="box">
        <summary>Movimentos previstos dia a dia</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th className="num">Entradas</th>
                <th className="num">Saídas</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((p) => (
                <tr key={p.date}>
                  <td>{formatDate(p.date)}</td>
                  <td className="num pos">{p.inflow ? formatMoney(p.inflow) : ""}</td>
                  <td className="num neg">{p.outflow ? formatMoney(p.outflow) : ""}</td>
                  <td className={`num ${p.balance < 0 ? "neg" : ""}`}>{formatMoney(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function parseDays(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return [30, 60, 90].includes(n) ? n : 90;
}
