import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { project } from "@/lib/finance";
import { addDays, formatDate, formatMoney, monthEnd, monthStart, today } from "@/lib/format";
import { accountKindLabels, companyDescriptions } from "@/lib/labels";
import { accountBalances, pendingItems, realizedTotals } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { DueItem } from "./DueItem";
import { LineChart, type Series } from "./LineChart";
import { Money } from "./Money";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function sumBy<T>(list: T[], f: (t: T) => number) {
  return list.reduce((s, t) => s + f(t), 0);
}

export async function Overview({ companies, consolidated }: { companies: CompanyWithRole[]; consolidated: boolean }) {
  const ids = companies.map((c) => c.id);
  const d0 = today();
  const [from, to] = [monthStart(d0), monthEnd(d0)];
  const [balances, pending90, month, ...perMonth] = await Promise.all([
    accountBalances(ids),
    pendingItems(ids, addDays(d0, 90)),
    realizedTotals(ids, from, to),
    ...companies.map((c) => realizedTotals([c.id], from, to)),
  ]);
  // No consolidado, transferências entre as empresas se anulam e não são receita nem despesa.
  const relevant = consolidated ? pending90.filter((p) => !p.transferId) : pending90;
  const lim30 = addDays(d0, 30);
  const in30 = relevant.filter((p) => p.dueDate <= lim30);
  const receive30 = in30.filter((p) => p.type === "entrada");
  const pay30 = in30.filter((p) => p.type === "saida");
  const balance = sumBy(balances, (b) => b.balance);
  const proj = project(balance, pending90, d0, 90);
  const proj30 = proj.points[30].balance;
  const overdue = relevant.filter((p) => p.dueDate < d0);
  const byId = new Map(companies.map((c) => [c.id, c]));

  const perCompany = companies.map((c, i) => {
    const b = sumBy(balances.filter((x) => x.companyId === c.id), (x) => x.balance);
    const items = pending90.filter((p) => p.companyId === c.id);
    return { company: c, balance: b, projection: project(b, items, d0, 90), month: perMonth[i] };
  });

  const series: Series[] = consolidated
    ? [
        { name: "Consolidado", color: "var(--accent)", width: 3, area: true, points: proj.points },
        ...perCompany.map((p) => ({ name: p.company.name, color: p.company.color, width: 1.6, points: p.projection.points })),
      ]
    : [{ name: companies[0].name, color: companies[0].color, width: 3, area: true, points: proj.points }];

  const upcoming = relevant.slice(0, 8);
  const negatives = perCompany.filter((p) => p.projection.minBalance < 0);
  const contasHref = consolidated ? "/consolidado/pagar" : `/empresa/${companies[0].slug}/pagar`;
  const monthName = MONTHS[Number(d0.slice(5, 7)) - 1];

  return (
    <div className="stack">
      {negatives.map((p) => {
        const first = p.projection.points.find((x) => x.balance < 0)!;
        return (
          <div className="alert error" key={p.company.id}>
            <p>
              <b>{p.company.name}</b> fica com saldo negativo em <b>{formatDate(first.date).slice(0, 5)}</b> ({formatMoney(first.balance)}) se nada mudar.
              Dá para cobrir com uma transferência de outra empresa ou adiar um pagamento.
            </p>
            {consolidated && (
              <Link className="btn sm" href="/consolidado/entre-empresas">
                Fazer transferência
              </Link>
            )}
          </div>
        );
      })}
      {overdue.length > 0 && (
        <div className="alert warn">
          <p>
            <b>
              {overdue.length} {overdue.length === 1 ? "conta vencida" : "contas vencidas"}
            </b>
            : {formatMoney(sumBy(overdue.filter((p) => p.type === "entrada"), (p) => p.amount))} para receber e{" "}
            {formatMoney(sumBy(overdue.filter((p) => p.type === "saida"), (p) => p.amount))} para pagar.
          </p>
          <Link className="btn sm" href={contasHref}>
            Ver contas
          </Link>
        </div>
      )}

      <div className="grid k4">
        <div className="card kpi hero">
          <span className="label">Saldo hoje · {consolidated ? `${companies.length} empresas` : companies[0].name}</span>
          <span className="value">{formatMoney(balance)}</span>
          <span className="sub">Bancos e caixa físico somados</span>
        </div>
        <div className="card kpi">
          <span className="label">A receber em 30 dias</span>
          <span className="value pos">{formatMoney(sumBy(receive30, (p) => p.amount))}</span>
          <span className="sub">{receive30.length} lançamentos, inclui vencidos</span>
        </div>
        <div className="card kpi">
          <span className="label">A pagar em 30 dias</span>
          <span className="value neg">{formatMoney(sumBy(pay30, (p) => p.amount))}</span>
          <span className="sub">{pay30.length} lançamentos, inclui vencidos</span>
        </div>
        <div className="card kpi">
          <span className="label">Saldo previsto em {formatDate(lim30).slice(0, 5)}</span>
          <span className={`value ${proj30 < 0 ? "neg" : ""}`}>{formatMoney(proj30)}</span>
          <span className="sub">
            {proj30 >= balance ? "+" : "−"} {formatMoney(Math.abs(proj30 - balance))} em relação a hoje
          </span>
        </div>
      </div>

      {consolidated && (
        <div className="grid k3">
          {perCompany.map((p) => (
            <Link key={p.company.id} href={`/empresa/${p.company.slug}`} className="card company-card" style={{ ["--c" as string]: p.company.color }}>
              <div>
                <h3>{p.company.name}</h3>
                <div className="small muted">{companyDescriptions[p.company.slug] ?? ""}</div>
              </div>
              <div>
                <div className="eyebrow">Saldo hoje</div>
                <div className={`big ${p.balance < 0 ? "neg" : ""}`}>{formatMoney(p.balance)}</div>
              </div>
              <dl className="kv">
                <dt>Entrou em {monthName}</dt>
                <dd className="pos">{formatMoney(p.month.inflow)}</dd>
                <dt>Saiu em {monthName}</dt>
                <dd className="neg">{formatMoney(p.month.outflow)}</dd>
                <dt>Previsto em 30 dias</dt>
                <dd className={p.projection.points[30].balance < 0 ? "neg" : undefined}>
                  <b>{formatMoney(p.projection.points[30].balance)}</b>
                </dd>
              </dl>
            </Link>
          ))}
        </div>
      )}

      <div className="grid main-side">
        <div className="card">
          <div className="panel-h">
            <h2>Saldo previsto, próximos 90 dias</h2>
            <span className="small muted">
              Menor saldo: <Money value={proj.minBalance} colored /> em {formatDate(proj.minDate).slice(0, 5)}
            </span>
          </div>
          <LineChart series={series} />
        </div>
        <div className="card">
          <div className="panel-h">
            <h2>Próximos vencimentos</h2>
            <Link className="btn sm" href={contasHref}>
              Ver todos
            </Link>
          </div>
          <div className="list">
            {upcoming.length === 0 && <p className="muted">Nada pendente.</p>}
            {upcoming.map((p) => {
              const c = byId.get(p.companyId)!;
              return (
                <DueItem
                  key={p.id}
                  item={p}
                  companyName={consolidated ? c.name : undefined}
                  companyColor={c.color}
                  canPay={roleAllows(c.role, "lancar") && p.source === "manual"}
                />
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid k2">
        <div className="card">
          <h2>
            Realizado em {monthName}
          </h2>
          <div className="sumrow">
            <div>
              <span className="eyebrow">Entradas</span>
              <span className="v pos">{formatMoney(month.inflow)}</span>
            </div>
            <div>
              <span className="eyebrow">Saídas</span>
              <span className="v neg">{formatMoney(month.outflow)}</span>
            </div>
            <div>
              <span className="eyebrow">Resultado</span>
              <span className={`v ${month.inflow - month.outflow < 0 ? "neg" : ""}`}>{formatMoney(month.inflow - month.outflow)}</span>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            Transferências entre empresas não entram como entrada ou saída.
          </p>
        </div>
        <div className="card">
          <h2>Saldo por conta</h2>
          <table>
            <tbody>
              {balances
                .filter((b) => b.active || b.balance !== 0)
                .map((b) => (
                  <tr key={b.id}>
                    <td>
                      {consolidated && (
                        <span className="dot" style={{ background: byId.get(b.companyId)?.color, marginRight: 8 }} title={byId.get(b.companyId)?.name} />
                      )}
                      {b.name} <span className="badge">{accountKindLabels[b.kind]}</span>
                      {consolidated && <span className="small muted"> · {byId.get(b.companyId)?.name}</span>}
                    </td>
                    <td className="num">
                      <Money value={b.balance} colored />
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
