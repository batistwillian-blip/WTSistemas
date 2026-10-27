import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { addDays, formatDate, formatMoney, today } from "@/lib/format";
import type { Period } from "@/lib/period";
import { paidBills, pendingItems } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { DueItem } from "./DueItem";
import { PeriodFilter } from "./PeriodFilter";

/**
 * Contas a pagar ou a receber de uma empresa (ou do consolidado), em duas abas:
 * "Em aberto" (agrupadas por prazo) e "Pagas/Recebidas" (por data do pagamento, num filtro separado).
 */
export async function BillsView({
  companies,
  consolidated,
  type,
  status,
  period,
  basePath,
}: {
  companies: CompanyWithRole[];
  consolidated: boolean;
  type: "entrada" | "saida";
  status: "abertas" | "pagas";
  period: Period;
  basePath: string;
}) {
  const ids = companies.map((c) => c.id);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const d0 = today();
  const paidLabel = type === "saida" ? "Pagas" : "Recebidas";
  const tabs = (
    <div className="tabs">
      <Link href={basePath} className={status === "abertas" ? "on" : undefined}>
        Em aberto
      </Link>
      <Link href={`${basePath}?situacao=pagas`} className={status === "pagas" ? "on" : undefined}>
        {paidLabel}
      </Link>
    </div>
  );

  if (status === "pagas") {
    const list = await paidBills(ids, type, period.from, period.to, consolidated);
    const total = list.reduce((s, t) => s + t.amount, 0);
    const off = list.filter((t) => t.offBalance);
    return (
      <div className="stack">
        {tabs}
        <PeriodFilter period={period} keep={{ situacao: "pagas" }} />
        <div className="card table-wrap">
          <div className="panel-h">
            <h2>
              {paidLabel} de {formatDate(period.from)} a {formatDate(period.to)}
            </h2>
            <b className={`num ${type === "entrada" ? "pos" : "neg"}`}>{formatMoney(total)}</b>
          </div>
          {off.length > 0 && (
            <p className="help" style={{ marginBottom: 8 }}>
              {off.length} {off.length === 1 ? "conta veio" : "contas vieram"} do CHServer só para consulta ({formatMoney(off.reduce((s, t) => s + t.amount, 0))}): não
              entram no saldo do caixa (aparecem só aqui e em Relatórios).
            </p>
          )}
          {list.length === 0 ? (
            <p className="muted">Nada {type === "saida" ? "pago" : "recebido"} no período.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{type === "saida" ? "Pago em" : "Recebido em"}</th>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  {consolidated && <th>Empresa</th>}
                  <th>Conta</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {list.map((t) => (
                  <tr key={t.id}>
                    <td className="small">{formatDate(t.paidAt)}</td>
                    <td className="small muted">{formatDate(t.dueDate)}</td>
                    <td>
                      {t.description}
                      {t.counterpart && <div className="small muted">{t.counterpart}</div>}
                      {t.offBalance ? (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          só consulta
                        </span>
                      ) : t.source === "chserver" ? (
                        <span className="badge" style={{ marginLeft: 6 }}>
                          CHServer
                        </span>
                      ) : null}
                    </td>
                    {consolidated && <td className="small">{byId.get(t.companyId)?.name}</td>}
                    <td className="small">{t.offBalance ? "—" : t.accountName}</td>
                    <td className="num">{formatMoney(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  const all = await pendingItems(ids, addDays(d0, 365 * 5));
  const list = all.filter((p) => p.type === type && !(consolidated && p.transferId));
  const sum = (l: typeof list) => l.reduce((s, p) => s + p.amount, 0);
  const groups: [string, typeof list][] = [
    ["Vencidas", list.filter((p) => p.dueDate < d0)],
    ["Próximos 7 dias", list.filter((p) => p.dueDate >= d0 && p.dueDate <= addDays(d0, 7))],
    ["Próximos 30 dias", list.filter((p) => p.dueDate > addDays(d0, 7) && p.dueDate <= addDays(d0, 30))],
    ["Depois", list.filter((p) => p.dueDate > addDays(d0, 30))],
  ];
  const overdue = groups[0][1];
  const next30 = list.filter((p) => p.dueDate >= d0 && p.dueDate <= addDays(d0, 30));
  const tone = type === "entrada" ? "pos" : "neg";
  return (
    <div className="stack">
      {tabs}
      <div className="grid k3">
        <div className="card kpi">
          <span className="label">Total em aberto</span>
          <span className={`value ${tone}`}>{formatMoney(sum(list))}</span>
          <span className="sub">{list.length} contas</span>
        </div>
        <div className="card kpi">
          <span className="label">Vencidas</span>
          <span className={`value ${overdue.length ? "neg" : ""}`}>{formatMoney(sum(overdue))}</span>
          <span className="sub">{overdue.length} contas</span>
        </div>
        <div className="card kpi">
          <span className="label">Próximos 30 dias</span>
          <span className={`value ${tone}`}>{formatMoney(sum(next30))}</span>
          <span className="sub">{next30.length} contas</span>
        </div>
      </div>
      <div className="card">
        {list.length === 0 && <p className="muted">Nada em aberto.</p>}
        {groups
          .filter(([, g]) => g.length)
          .map(([label, g]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div className="panel-h" style={{ marginBottom: 4 }}>
                <span className="eyebrow" style={label === "Vencidas" ? { color: "var(--out)" } : undefined}>
                  {label}
                </span>
                <span className="num muted small">{formatMoney(sum(g))}</span>
              </div>
              <div className="list">
                {g.map((p) => {
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
          ))}
      </div>
    </div>
  );
}
