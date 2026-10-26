import Link from "next/link";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { PageHead } from "@/components/PageHead";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { requireCompany } from "@/lib/access";
import { addMonths, formatDate, formatMoney, monthEnd, today } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export default async function VendasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const { company, user } = await requireCompany(slug);
  const mes = param(await searchParams, "mes");
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today().slice(0, 7);
  const from = `${month}-01`;
  const to = monthEnd(from);

  const rows = await db
    .select()
    .from(sales)
    .where(and(eq(sales.companyId, company.id), isNull(sales.deletedAt), gte(sales.date, from), lte(sales.date, to)))
    .orderBy(desc(sales.date), desc(sales.time), desc(sales.id));

  const valid = rows.filter((r) => !r.canceled);
  const gross = valid.reduce((s, r) => s + r.total, 0);
  const returned = valid.reduce((s, r) => s + r.returned, 0);
  const net = gross - returned;
  const days = new Map<string, { n: number; net: number }>();
  for (const r of valid) {
    const d = days.get(r.date) ?? { n: 0, net: 0 };
    d.n++;
    d.net += Math.max(0, r.total - r.returned);
    days.set(r.date, d);
  }
  const prev = addMonths(from, -1).slice(0, 7);
  const next = addMonths(from, 1).slice(0, 7);
  const monthName = `${MONTHS[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;

  return (
    <>
      <PageHead
        context={company.name}
        color={company.color}
        title="Vendas"
        subtitle="Notas de saída importadas do CHServer. O total de cada dia entra no caixa como “Vendas do dia”."
      />
      <div className="filters">
        <Link className="btn sm" href={`?mes=${prev}`}>
          ← {MONTHS[Number(prev.slice(5, 7)) - 1]}
        </Link>
        <b style={{ alignSelf: "center" }}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</b>
        {next <= today().slice(0, 7) && (
          <Link className="btn sm" href={`?mes=${next}`}>
            {MONTHS[Number(next.slice(5, 7)) - 1]} →
          </Link>
        )}
        {user.isAdmin && (
          <Link className="btn sm" href="/admin/integracoes" style={{ marginLeft: "auto" }}>
            Importar agora
          </Link>
        )}
      </div>

      <div className="grid k4">
        <div className="card kpi hero">
          <span className="label">Vendido no mês</span>
          <span className="value">{formatMoney(net)}</span>
          <span className="sub">já descontadas devoluções</span>
        </div>
        <div className="card kpi">
          <span className="label">Notas</span>
          <span className="value">{valid.length}</span>
          <span className="sub">{rows.length - valid.length} {rows.length - valid.length === 1 ? "cancelada" : "canceladas"}</span>
        </div>
        <div className="card kpi">
          <span className="label">Ticket médio</span>
          <span className="value">{formatMoney(valid.length ? Math.round(net / valid.length) : 0)}</span>
          <span className="sub">por nota</span>
        </div>
        <div className="card kpi">
          <span className="label">Devoluções</span>
          <span className="value neg">{formatMoney(returned)}</span>
          <span className="sub">no mês</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p className="muted">Nenhuma venda importada neste mês. As vendas dos últimos 90 dias são importadas pelo Integrador BI.</p>
        </div>
      ) : (
        <div className="grid main-side">
          <div className="card table-wrap">
            <h2>Notas</h2>
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Nota</th>
                  <th>Cliente</th>
                  <th>Situação</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const items = (r.items as { produto: string; qtde: number; total: number }[] | null) ?? [];
                  return (
                    <tr key={r.id} className={r.canceled ? "muted" : undefined}>
                      <td className="num" style={{ textAlign: "left" }}>
                        {formatDate(r.date).slice(0, 5)} {r.time && <span className="muted small">{r.time}</span>}
                      </td>
                      <td>
                        {items.length > 0 ? (
                          <details>
                            <summary>
                              {r.number ?? "s/n"} <span className="small muted">· {items.length} itens</span>
                            </summary>
                            <div className="small" style={{ marginTop: 6 }}>
                              {items.map((i, k) => (
                                <div key={k}>
                                  {i.qtde}× {i.produto} <span className="muted">{formatMoney(i.total)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          (r.number ?? "s/n")
                        )}
                      </td>
                      <td className="small">{r.customer}</td>
                      <td>
                        <span className={`badge ${r.canceled ? "red" : "green"}`}>{r.status ?? "—"}</span>
                      </td>
                      <td className="num">
                        {formatMoney(r.total)}
                        {r.returned > 0 && <div className="small neg">devolvido {formatMoney(r.returned)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card">
            <h2>Por dia</h2>
            <table>
              <tbody>
                {[...days.entries()].map(([d, v]) => (
                  <tr key={d}>
                    <td>{formatDate(d)}</td>
                    <td className="small muted">
                      {v.n} {v.n === 1 ? "nota" : "notas"}
                    </td>
                    <td className="num pos">{formatMoney(v.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
