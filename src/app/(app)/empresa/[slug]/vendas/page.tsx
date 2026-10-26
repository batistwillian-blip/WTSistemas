import Link from "next/link";
import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { BarChart } from "@/components/BarChart";
import { PageHead } from "@/components/PageHead";
import { PeriodFilter } from "@/components/PeriodFilter";
import { db } from "@/db";
import { sales } from "@/db/schema";
import { requireCompany } from "@/lib/access";
import { addDays, addMonths, formatDate, formatMoney, monthEnd, monthStart } from "@/lib/format";
import type { SearchParams } from "@/lib/page";
import { monthsBetween, previousPeriod, readPeriod } from "@/lib/period";

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
type Item = { produto: string; qtde: number; total: number };

// Valor líquido de uma nota: total menos devolução; cancelada vale zero.
const netSql = sql`case when ${sales.canceled} then 0 else greatest(${sales.total} - ${sales.returned}, 0) end`;

function change(now: number, before: number) {
  if (!before) return null;
  const pct = ((now - before) / before) * 100;
  return { text: `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`, up: pct >= 0 };
}

async function totals(companyId: number, from: string, to: string) {
  const [r] = await db
    .select({
      net: sql<string>`coalesce(sum(${netSql}), 0)`,
      returned: sql<string>`coalesce(sum(${sales.returned}) filter (where not ${sales.canceled}), 0)`,
      notes: sql<number>`(count(*) filter (where not ${sales.canceled}))::int`,
      canceled: sql<number>`(count(*) filter (where ${sales.canceled}))::int`,
    })
    .from(sales)
    .where(and(eq(sales.companyId, companyId), isNull(sales.deletedAt), gte(sales.date, from), lte(sales.date, to)));
  return { net: Number(r.net), returned: Number(r.returned), notes: r.notes, canceled: r.canceled };
}

export default async function VendasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const { company, user } = await requireCompany(slug);
  const period = readPeriod(await searchParams);
  const prev = previousPeriod(period);
  const where = (from: string, to: string) => and(eq(sales.companyId, company.id), isNull(sales.deletedAt), gte(sales.date, from), lte(sales.date, to));
  const chartFrom = addMonths(monthStart(period.to), -11);

  const [now, before, monthly, daily, products, weekdays, notes] = await Promise.all([
    totals(company.id, period.from, period.to),
    totals(company.id, prev.from, prev.to),
    db
      .select({ month: sql<string>`to_char(${sales.date}, 'YYYY-MM')`, net: sql<string>`sum(${netSql})` })
      .from(sales)
      .where(where(chartFrom, monthEnd(period.to)))
      .groupBy(sql`1`),
    db
      .select({ date: sales.date, net: sql<string>`sum(${netSql})`, n: sql<number>`(count(*) filter (where not ${sales.canceled}))::int` })
      .from(sales)
      .where(where(period.from, period.to))
      .groupBy(sales.date),
    db.execute<{ produto: string; qtde: string; total: string; notas: number }>(sql`
      select i->>'produto' as produto, sum((i->>'qtde')::numeric) as qtde, sum((i->>'total')::bigint) as total, count(distinct ${sales.id})::int as notas
      from ${sales}, jsonb_array_elements(coalesce(${sales.items}, '[]'::jsonb)) as i
      where ${sales.companyId} = ${company.id} and ${sales.deletedAt} is null and not ${sales.canceled}
        and ${sales.date} >= ${period.from} and ${sales.date} <= ${period.to}
      group by 1 order by 3 desc limit 15`),
    db
      .select({ dow: sql<number>`extract(dow from ${sales.date})::int`, net: sql<string>`sum(${netSql})`, n: sql<number>`(count(*) filter (where not ${sales.canceled}))::int` })
      .from(sales)
      .where(where(period.from, period.to))
      .groupBy(sql`1`),
    db
      .select()
      .from(sales)
      .where(where(period.from, period.to))
      .orderBy(desc(sales.date), desc(sales.time), desc(sales.id))
      .limit(300),
  ]);

  const months = monthsBetween(chartFrom, period.to);
  const byMonth = new Map(monthly.map((m) => [m.month, Number(m.net)]));
  const byDay = new Map(daily.map((d) => [d.date, { net: Number(d.net), n: d.n }]));
  const days: string[] = [];
  for (let d = period.from; d <= period.to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const showDays = days.length <= 62;
  const ticket = now.notes ? Math.round(now.net / now.notes) : 0;
  const ticketBefore = before.notes ? Math.round(before.net / before.notes) : 0;
  const productRows = products.rows ?? [];
  const productTotal = productRows.reduce((s, p) => s + Number(p.total), 0);
  const best = [...byDay.entries()].sort((a, b) => b[1].net - a[1].net)[0];

  const Delta = ({ now: a, before: b }: { now: number; before: number }) => {
    const c = change(a, b);
    return c ? (
      <span className={c.up ? "pos" : "neg"}>
        {c.text} <span className="muted">vs. período anterior</span>
      </span>
    ) : (
      <span className="muted">sem período anterior para comparar</span>
    );
  };

  return (
    <>
      <PageHead context={company.name} color={company.color} title="Vendas" subtitle="Notas de saída importadas do CHServer (só consulta)." />
      <div className="filters" style={{ justifyContent: "space-between" }}>
        <PeriodFilter period={period} />
        {user.isAdmin && (
          <Link className="btn sm" href="/admin/integracoes">
            Importar agora
          </Link>
        )}
      </div>

      <div className="grid k4">
        <div className="card kpi hero">
          <span className="label">Vendido no período</span>
          <span className="value">{formatMoney(now.net)}</span>
          <span className="sub">
            {formatDate(period.from)} a {formatDate(period.to)}, já sem devoluções
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Notas</span>
          <span className="value">{now.notes}</span>
          <span className="sub">
            <Delta now={now.notes} before={before.notes} />
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Ticket médio</span>
          <span className="value">{formatMoney(ticket)}</span>
          <span className="sub">
            <Delta now={ticket} before={ticketBefore} />
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Devoluções e cancelamentos</span>
          <span className="value neg">{formatMoney(now.returned)}</span>
          <span className="sub">
            {now.canceled} {now.canceled === 1 ? "nota cancelada" : "notas canceladas"}
          </span>
        </div>
      </div>
      <p className="small">
        Vendido em relação ao período anterior ({formatDate(prev.from)} a {formatDate(prev.to)}, {formatMoney(before.net)}):{" "}
        <Delta now={now.net} before={before.net} />
        {best && (
          <>
            {" "}
            · Melhor dia: <b>{formatDate(best[0])}</b> ({formatMoney(best[1].net)})
          </>
        )}
      </p>

      <div className="card">
        <div className="panel-h">
          <h2>Comparativo por mês</h2>
          <span className="small muted">últimos 12 meses</span>
        </div>
        <BarChart labels={months} highlight={months.indexOf(period.to.slice(0, 7))} series={[{ name: "Vendido", color: company.color, values: months.map((m) => byMonth.get(m) ?? 0) }]} />
      </div>

      {showDays && (
        <div className="card">
          <h2>Vendas por dia</h2>
          <BarChart
            labels={days.map((d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`)}
            series={[{ name: "Vendido", color: company.color, values: days.map((d) => byDay.get(d)?.net ?? 0) }]}
            height={200}
          />
        </div>
      )}

      <div className="grid main-side" style={{ alignItems: "start" }}>
        <div className="card table-wrap">
          <h2>Produtos mais vendidos</h2>
          {productRows.length === 0 ? (
            <p className="muted">Sem itens nas notas do período.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Qtde</th>
                  <th className="num">Notas</th>
                  <th className="num">Total</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {productRows.map((p, i) => (
                  <tr key={p.produto + i}>
                    <td>
                      <span className="muted small">{i + 1}.</span> {p.produto || "Sem descrição"}
                    </td>
                    <td className="num">{Number(p.qtde).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                    <td className="num muted">{p.notas}</td>
                    <td className="num">{formatMoney(Number(p.total))}</td>
                    <td className="num muted">{productTotal ? ((Number(p.total) / productTotal) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>Por dia da semana</h2>
          <table>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const w = weekdays.find((x) => x.dow === d);
                return (
                  <tr key={d}>
                    <td>{WEEKDAYS[d]}</td>
                    <td className="small muted">{w?.n ?? 0} notas</td>
                    <td className="num">{formatMoney(Number(w?.net ?? 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card table-wrap">
        <details>
          <summary>
            <b>Notas do período</b> <span className="small muted">({notes.length === 300 ? "300 mais recentes" : notes.length})</span>
          </summary>
          <table style={{ marginTop: 10 }}>
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
              {notes.map((r) => {
                const items = (r.items as Item[] | null) ?? [];
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
        </details>
      </div>
    </>
  );
}
