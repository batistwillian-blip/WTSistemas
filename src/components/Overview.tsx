import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { project } from "@/lib/finance";
import { addDays, formatDate, monthEnd, monthStart, today } from "@/lib/format";
import { accountBalances, pendingItems, realizedTotals } from "@/lib/queries";
import { accountKindLabels } from "@/lib/labels";
import { LineChart } from "./LineChart";
import { Money } from "./Money";

function sumBy<T>(list: T[], f: (t: T) => number) {
  return list.reduce((s, t) => s + f(t), 0);
}

export async function Overview({ companies, consolidated }: { companies: CompanyWithRole[]; consolidated: boolean }) {
  const ids = companies.map((c) => c.id);
  const d0 = today();
  const [balances, pending90, month] = await Promise.all([
    accountBalances(ids),
    pendingItems(ids, addDays(d0, 90)),
    realizedTotals(ids, monthStart(d0), monthEnd(d0)),
  ]);
  // No consolidado, transferências entre as empresas se anulam e não são receita nem despesa.
  const relevant = consolidated ? pending90.filter((p) => !p.transferId) : pending90;
  const in30 = relevant.filter((p) => p.dueDate <= addDays(d0, 30));
  const balance = sumBy(balances, (b) => b.balance);
  const proj = project(balance, pending90, d0, 90);
  const proj30 = proj.points[30]?.balance ?? balance;
  const overdue = relevant.filter((p) => p.dueDate < d0);

  const perCompany = companies.map((c) => {
    const items = in30.filter((p) => p.companyId === c.id);
    return {
      company: c,
      balance: sumBy(balances.filter((b) => b.companyId === c.id), (b) => b.balance),
      receive: sumBy(items.filter((p) => p.type === "entrada"), (p) => p.amount),
      pay: sumBy(items.filter((p) => p.type === "saida"), (p) => p.amount),
    };
  });

  return (
    <div className="stack">
      <div className="grid k4">
        <div className="card kpi">
          <div className="label">Saldo hoje</div>
          <div className="value">
            <Money value={balance} colored />
          </div>
          <div className="sub">Somando {balances.filter((b) => b.active).length} contas</div>
        </div>
        <div className="card kpi">
          <div className="label">A receber em 30 dias</div>
          <div className="value pos">
            <Money value={sumBy(in30.filter((p) => p.type === "entrada"), (p) => p.amount)} />
          </div>
          <div className="sub">inclui vencidos</div>
        </div>
        <div className="card kpi">
          <div className="label">A pagar em 30 dias</div>
          <div className="value neg">
            <Money value={sumBy(in30.filter((p) => p.type === "saida"), (p) => p.amount)} />
          </div>
          <div className="sub">inclui vencidos</div>
        </div>
        <div className="card kpi">
          <div className="label">Saldo projetado em 30 dias</div>
          <div className="value">
            <Money value={proj30} colored />
          </div>
          <div className="sub">{formatDate(addDays(d0, 30))}</div>
        </div>
      </div>

      {overdue.length > 0 && (
        <div className="alert error">
          {overdue.length} {overdue.length === 1 ? "conta vencida" : "contas vencidas"} sem baixa:{" "}
          <Money value={sumBy(overdue.filter((p) => p.type === "entrada"), (p) => p.amount)} /> a receber e{" "}
          <Money value={sumBy(overdue.filter((p) => p.type === "saida"), (p) => p.amount)} /> a pagar.{" "}
          <Link href={consolidated ? "/consolidado/contas" : `/empresa/${companies[0].slug}/contas`}>Ver contas</Link>
        </div>
      )}
      {proj.minBalance < 0 && (
        <div className="alert error">
          Atenção: o saldo projetado fica negativo em {formatDate(proj.minDate)} (<Money value={proj.minBalance} />).
        </div>
      )}

      {consolidated && (
        <div className="grid k3">
          {perCompany.map((p) => (
            <Link
              key={p.company.id}
              href={`/empresa/${p.company.slug}`}
              className="card company-card"
              style={{ ["--c" as string]: p.company.color, color: "inherit", textDecoration: "none" }}
            >
              <h3>{p.company.name}</h3>
              <div className="kpi">
                <div className="value">
                  <Money value={p.balance} colored />
                </div>
                <div className="sub">
                  Receber 30d: <Money value={p.receive} /> · Pagar 30d: <Money value={p.pay} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="grid k2">
        <div className="card">
          <h2>Saldo projetado (90 dias)</h2>
          <LineChart points={proj.points} />
          <p className="small muted">
            Menor saldo: <Money value={proj.minBalance} colored /> em {formatDate(proj.minDate)}. No fim do período:{" "}
            <Money value={proj.endBalance} colored />.
          </p>
        </div>
        <div className="card">
          <h2>Este mês (realizado)</h2>
          <table>
            <tbody>
              <tr>
                <td>Entradas</td>
                <td className="num pos">
                  <Money value={month.inflow} />
                </td>
              </tr>
              <tr>
                <td>Saídas</td>
                <td className="num neg">
                  <Money value={month.outflow} />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Resultado</strong>
                </td>
                <td className="num">
                  <strong>
                    <Money value={month.inflow - month.outflow} colored />
                  </strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="small muted">Transferências entre empresas não entram como entrada ou saída.</p>
          {!consolidated && (
            <>
              <h3 style={{ marginTop: 16 }}>Saldo por conta</h3>
              <table>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {b.name} <span className="badge">{accountKindLabels[b.kind]}</span>
                        {!b.active && <span className="badge">inativa</span>}
                      </td>
                      <td className="num">
                        <Money value={b.balance} colored />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
