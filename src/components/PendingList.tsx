import Link from "next/link";
import { setPaid } from "@/app/actions/lancamentos";
import type { CompanyWithRole } from "@/lib/access";
import { addDays, formatDate, today } from "@/lib/format";
import { pendingItems } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { Money } from "./Money";

type Filter = "todas" | "receber" | "pagar";

export async function PendingList({
  companies,
  consolidated,
  filter,
  basePath,
}: {
  companies: CompanyWithRole[];
  consolidated: boolean;
  filter: Filter;
  basePath: string;
}) {
  const d0 = today();
  const all = await pendingItems(companies.map((c) => c.id), addDays(d0, 365));
  const items = all.filter(
    (p) => (filter === "todas" || (filter === "receber" ? p.type === "entrada" : p.type === "saida")) && !(consolidated && p.transferId),
  );
  const byId = new Map(companies.map((c) => [c.id, c]));
  const buckets = [
    { title: "Vencidas", items: items.filter((p) => p.dueDate < d0), tone: "red" },
    { title: "Hoje e próximos 7 dias", items: items.filter((p) => p.dueDate >= d0 && p.dueDate <= addDays(d0, 7)), tone: "amber" },
    { title: "De 8 a 30 dias", items: items.filter((p) => p.dueDate > addDays(d0, 7) && p.dueDate <= addDays(d0, 30)), tone: "" },
    { title: "Depois de 30 dias", items: items.filter((p) => p.dueDate > addDays(d0, 30)), tone: "" },
  ];

  return (
    <div className="stack">
      <div className="tabs">
        {(["todas", "receber", "pagar"] as const).map((f) => (
          <Link key={f} href={`${basePath}?tipo=${f}`} className={f === filter ? "on" : undefined}>
            {f === "todas" ? "Todas" : f === "receber" ? "A receber" : "A pagar"}
          </Link>
        ))}
      </div>
      {buckets.map((b) => {
        const inflow = b.items.filter((p) => p.type === "entrada").reduce((s, p) => s + p.amount, 0);
        const outflow = b.items.filter((p) => p.type === "saida").reduce((s, p) => s + p.amount, 0);
        return (
          <div className="card" key={b.title}>
            <div className="page-head" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>
                {b.title} <span className={`badge ${b.tone}`}>{b.items.length}</span>
              </h2>
              <span className="small muted">
                Receber <Money value={inflow} /> · Pagar <Money value={outflow} />
              </span>
            </div>
            {b.items.length === 0 ? (
              <p className="muted small">Nada aqui.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Vencimento</th>
                      {consolidated && <th>Empresa</th>}
                      <th>Descrição</th>
                      <th>Cliente / fornecedor</th>
                      <th className="num">Valor</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {b.items.map((p) => {
                      const c = byId.get(p.companyId)!;
                      const canPay = roleAllows(c.role, "lancar") && p.source === "manual";
                      return (
                        <tr key={p.id}>
                          <td>{formatDate(p.dueDate)}</td>
                          {consolidated && <td>{c.name}</td>}
                          <td>
                            {p.description} {p.source === "chserver" && <span className="badge blue">CHServer</span>}
                          </td>
                          <td className="muted">{p.counterpart}</td>
                          <td className={`num ${p.type === "entrada" ? "pos" : "neg"}`}>
                            <Money value={p.type === "entrada" ? p.amount : -p.amount} />
                          </td>
                          <td>
                            {canPay && (
                              <form action={setPaid} className="row-actions">
                                <input type="hidden" name="id" value={p.id} />
                                <button className="btn sm" type="submit" title="Marcar como pago/recebido hoje">
                                  {p.type === "entrada" ? "Recebido" : "Pago"}
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
