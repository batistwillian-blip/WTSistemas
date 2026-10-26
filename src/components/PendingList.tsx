import type { CompanyWithRole } from "@/lib/access";
import { addDays, formatMoney, today } from "@/lib/format";
import { pendingItems } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { DueItem } from "./DueItem";

type Filter = "todas" | "receber" | "pagar";

/** Contas pendentes em duas colunas (a receber / a pagar), agrupadas por prazo como no protótipo. */
export async function PendingList({
  companies,
  consolidated,
}: {
  companies: CompanyWithRole[];
  consolidated: boolean;
  filter?: Filter;
  basePath?: string;
}) {
  const d0 = today();
  const all = await pendingItems(companies.map((c) => c.id), addDays(d0, 365));
  const items = all.filter((p) => !(consolidated && p.transferId));
  const byId = new Map(companies.map((c) => [c.id, c]));

  const column = (type: "entrada" | "saida", title: string) => {
    const list = items.filter((p) => p.type === type);
    const groups: [string, typeof list][] = [
      ["Vencidas", list.filter((p) => p.dueDate < d0)],
      ["Próximos 7 dias", list.filter((p) => p.dueDate >= d0 && p.dueDate <= addDays(d0, 7))],
      ["Próximos 30 dias", list.filter((p) => p.dueDate > addDays(d0, 7) && p.dueDate <= addDays(d0, 30))],
      ["Depois", list.filter((p) => p.dueDate > addDays(d0, 30))],
    ];
    return (
      <div className="card">
        <div className="panel-h">
          <h2>{title}</h2>
          <b className={`num ${type === "entrada" ? "pos" : "neg"}`}>{formatMoney(list.reduce((s, p) => s + p.amount, 0))}</b>
        </div>
        {list.length === 0 && <p className="muted">Nada pendente.</p>}
        {groups
          .filter(([, g]) => g.length)
          .map(([label, g]) => (
            <div key={label} style={{ marginBottom: 14 }}>
              <div className="panel-h" style={{ marginBottom: 4 }}>
                <span className="eyebrow" style={label === "Vencidas" ? { color: "var(--out)" } : undefined}>
                  {label}
                </span>
                <span className="num muted small">{formatMoney(g.reduce((s, p) => s + p.amount, 0))}</span>
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
    );
  };

  return (
    <div className="grid k2" style={{ alignItems: "start" }}>
      {column("entrada", "A receber")}
      {column("saida", "A pagar")}
    </div>
  );
}
