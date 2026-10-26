import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { project } from "@/lib/finance";
import { addDays, formatDate, monthEnd, today } from "@/lib/format";
import { accountBalances, pendingItems } from "@/lib/queries";
import { LineChart } from "./LineChart";
import { Money } from "./Money";

export async function ProjectionView({ companies, days, basePath }: { companies: CompanyWithRole[]; days: number; basePath: string }) {
  const ids = companies.map((c) => c.id);
  const d0 = today();
  const [balances, items] = await Promise.all([accountBalances(ids), pendingItems(ids, addDays(d0, days))]);
  const start = balances.reduce((s, b) => s + b.balance, 0);
  const proj = project(start, items, d0, days);
  const moves = proj.points.filter((p, i) => i === 0 || p.inflow || p.outflow);
  const monthEnds = proj.points.filter((p) => p.date === monthEnd(p.date));

  return (
    <div className="stack">
      <div className="tabs">
        {[30, 60, 90].map((d) => (
          <Link key={d} href={`${basePath}?dias=${d}`} className={d === days ? "on" : undefined}>
            {d} dias
          </Link>
        ))}
      </div>
      <div className="grid k4">
        <div className="card kpi">
          <div className="label">Saldo hoje</div>
          <div className="value">
            <Money value={start} colored />
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Saldo em {formatDate(addDays(d0, days))}</div>
          <div className="value">
            <Money value={proj.endBalance} colored />
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Menor saldo no período</div>
          <div className="value">
            <Money value={proj.minBalance} colored />
          </div>
          <div className="sub">em {formatDate(proj.minDate)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Vencidos considerados hoje</div>
          <div className="value small">
            <span className="pos">
              <Money value={proj.overdueIn} />
            </span>{" "}
            /{" "}
            <span className="neg">
              <Money value={proj.overdueOut} />
            </span>
          </div>
          <div className="sub">a receber / a pagar</div>
        </div>
      </div>
      {proj.minBalance < 0 && (
        <div className="alert error">
          O saldo fica negativo a partir de {formatDate(proj.points.find((p) => p.balance < 0)!.date)}. Antecipe recebimentos ou reprograme pagamentos.
        </div>
      )}
      <div className="card">
        <LineChart points={proj.points} height={260} />
        <p className="small muted">
          A projeção parte do saldo realizado de hoje e soma tudo o que está pendente pelo vencimento. Contas vencidas e não baixadas entram como se
          acontecessem hoje.
        </p>
      </div>
      {monthEnds.length > 0 && (
        <div className="card">
          <h2>Saldo no fim de cada mês</h2>
          <table>
            <tbody>
              {monthEnds.map((p) => (
                <tr key={p.date}>
                  <td>{formatDate(p.date)}</td>
                  <td className="num">
                    <Money value={p.balance} colored />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h2>Dia a dia</h2>
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
                  <td className="num pos">{p.inflow ? <Money value={p.inflow} /> : ""}</td>
                  <td className="num neg">{p.outflow ? <Money value={p.outflow} /> : ""}</td>
                  <td className="num">
                    <Money value={p.balance} colored />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function parseDays(v: string | string[] | undefined): number {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return [30, 60, 90].includes(n) ? n : 30;
}
