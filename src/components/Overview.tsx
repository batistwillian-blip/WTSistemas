import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { monthClose, weekBuckets, type MonthClose } from "@/lib/finance";
import { addDays, formatDate, formatMoney, monthEnd, monthStart, today } from "@/lib/format";
import { accountKindLabels, companyDescriptions } from "@/lib/labels";
import { accountBalances, pendingItems, realizedTotals, salesTotal } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { DueItem } from "./DueItem";
import { Money } from "./Money";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function sumBy<T>(list: T[], f: (t: T) => number) {
  return list.reduce((s, t) => s + f(t), 0);
}

const ddmm = (iso: string) => formatDate(iso).slice(0, 5);

type Focus = { tone: "red" | "amber" | "green" | ""; text: React.ReactNode; href?: string; action?: string };

export async function Overview({ companies, consolidated }: { companies: CompanyWithRole[]; consolidated: boolean }) {
  const ids = companies.map((c) => c.id);
  const d0 = today();
  const [from, to] = [monthStart(d0), monthEnd(d0)];
  const [balances, pending, month, sold, ...perMonth] = await Promise.all([
    accountBalances(ids),
    pendingItems(ids, addDays(d0, 70)),
    realizedTotals(ids, from, to),
    salesTotal(ids, from, d0),
    ...companies.map((c) => realizedTotals([c.id], from, to)),
  ]);
  // No consolidado, transferências entre as empresas se anulam e não são receita nem despesa.
  const relevant = consolidated ? pending.filter((p) => !p.transferId) : pending;
  const balance = sumBy(balances, (b) => b.balance);
  const close = monthClose(balance, relevant, d0, to);
  const weeks = weekBuckets(balance, relevant, d0, 8);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const monthName = MONTHS[Number(d0.slice(5, 7)) - 1];
  const base = consolidated ? "/consolidado" : `/empresa/${companies[0].slug}`;

  const perCompany = companies.map((c, i) => {
    const b = sumBy(balances.filter((x) => x.companyId === c.id), (x) => x.balance);
    return { company: c, balance: b, close: monthClose(b, pending.filter((p) => p.companyId === c.id), d0, to), month: perMonth[i] };
  });

  const inMonth = relevant.filter((p) => p.dueDate <= to);
  const overdue = relevant.filter((p) => p.dueDate < d0);
  const overdueIn = overdue.filter((p) => p.type === "entrada");
  const overdueOut = overdue.filter((p) => p.type === "saida");
  const elapsed = Number(d0.slice(8, 10));
  const salesPerDay = sold.notes ? Math.round(sold.net / elapsed) : 0;
  const perDayNeeded = close.shortfall ? Math.ceil(close.shortfall / close.daysLeft) : 0;

  // Onde focar: frases curtas e acionáveis, da mais urgente para a menos.
  const focus: Focus[] = [];
  if (overdueOut.length)
    focus.push({
      tone: "red",
      text: (
        <>
          <b>{overdueOut.length} {overdueOut.length === 1 ? "conta vencida" : "contas vencidas"} a pagar</b> ({formatMoney(sumBy(overdueOut, (p) => p.amount))}): pagar
          ou renegociar.
        </>
      ),
      href: `${base}/pagar`,
      action: "Ver",
    });
  if (overdueIn.length)
    focus.push({
      tone: "amber",
      text: (
        <>
          <b>Cobrar {overdueIn.length} {overdueIn.length === 1 ? "recebimento atrasado" : "recebimentos atrasados"}</b> (
          {formatMoney(sumBy(overdueIn, (p) => p.amount))}).
        </>
      ),
      href: `${base}/receber`,
      action: "Ver",
    });
  if (close.minBalance < 0 && close.endBalance >= 0)
    focus.push({
      tone: "amber",
      text: (
        <>
          Em <b>{ddmm(close.minDate)}</b> o saldo fica negativo ({formatMoney(close.minBalance)}) antes de entrar o resto: antecipe um recebimento ou adie um
          pagamento.
        </>
      ),
    });
  if (sold.notes)
    focus.push({
      tone: close.shortfall ? (salesPerDay >= perDayNeeded ? "green" : "amber") : "green",
      text: (
        <>
          Vendas de {monthName} até hoje: <b>{formatMoney(sold.net)}</b> (média de {formatMoney(salesPerDay)} por dia).
          {close.shortfall ? (
            <>
              {" "}
              Para cobrir o que falta, são <b>{formatMoney(perDayNeeded)} por dia</b> até {ddmm(to)}.
            </>
          ) : null}
        </>
      ),
      href: `/empresa/${companies.find((c) => c.slug === "primetech-loja")?.slug ?? companies[0].slug}/vendas`,
      action: "Vendas",
    });
  if (consolidated) {
    const short = perCompany.filter((p) => p.close.endBalance < 0);
    const spare = perCompany.filter((p) => p.close.endBalance > 0 && p.close.minBalance >= 0).sort((a, b) => b.close.endBalance - a.close.endBalance);
    for (const p of short) {
      const giver = spare[0];
      focus.push({
        tone: "red",
        text: (
          <>
            <b>{p.company.name}</b> fecha o mês faltando {formatMoney(p.close.shortfall)}
            {giver ? (
              <>
                ; {giver.company.name} deve terminar com {formatMoney(giver.close.endBalance)} e pode cobrir com uma transferência.
              </>
            ) : (
              "."
            )}
          </>
        ),
        href: "/consolidado/entre-empresas",
        action: "Transferir",
      });
    }
  }
  const biggest = inMonth
    .filter((p) => p.type === "saida" && p.dueDate >= d0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 2);
  for (const p of biggest)
    focus.push({
      tone: "",
      text: (
        <>
          Maior conta até o fim do mês: <b>{p.description.length > 48 ? p.description.slice(0, 46) + "…" : p.description}</b> {consolidated ? `(${byId.get(p.companyId)?.name}) ` : ""}— {formatMoney(p.amount)} em {ddmm(p.dueDate)}.
        </>
      ),
    });
  if (close.receive === 0 && close.pay > 0)
    focus.push({
      tone: "",
      text: <>Não há nada a receber lançado até {ddmm(to)}. Se há cobranças para emitir, lance em Contas a receber para a conta do mês ficar certa.</>,
      href: `${base}/receber`,
      action: "Lançar",
    });
  if (!focus.length) focus.push({ tone: "green", text: <>Tudo em dia: nenhuma conta vencida e o mês fecha no verde.</> });

  const covered = close.pay ? Math.min(1, Math.max(0, (balance + close.receive) / close.pay)) : 1;
  const maxWeek = Math.max(1, ...weeks.map((w) => Math.abs(w.endBalance)), ...weeks.map((w) => Math.max(w.inflow, w.outflow)));
  const upcoming = relevant.slice(0, 8);

  return (
    <div className="stack">
      <div className={`card insight ${close.shortfall ? "bad" : "good"}`}>
        <div className="insight-main">
          <span className="eyebrow">
            Fechamento de {monthName} · {close.daysLeft} {close.daysLeft === 1 ? "dia" : "dias"} até {ddmm(to)}
          </span>
          {close.shortfall ? (
            <h2>
              Faltam <span className="num neg">{formatMoney(close.shortfall)}</span> para fechar {monthName} no verde
            </h2>
          ) : (
            <h2>
              {monthName.charAt(0).toUpperCase() + monthName.slice(1)} fecha no verde, com <span className="num pos">{formatMoney(close.endBalance)}</span>
            </h2>
          )}
          <p className="small">
            {close.shortfall
              ? `É o que ainda precisa faturar ou receber, além do que já está lançado: cerca de ${formatMoney(perDayNeeded)} por dia até ${ddmm(to)}.`
              : `Já contando tudo o que está lançado para receber e pagar até ${ddmm(to)}.`}
          </p>
          <div className="eq">
            <div>
              <span>Saldo hoje</span>
              <b className="num">{formatMoney(balance)}</b>
            </div>
            <i>+</i>
            <div>
              <span>A receber até {ddmm(to)}</span>
              <b className="num pos">{formatMoney(close.receive)}</b>
            </div>
            <i>−</i>
            <div>
              <span>A pagar até {ddmm(to)}</span>
              <b className="num neg">{formatMoney(close.pay)}</b>
            </div>
            <i>=</i>
            <div>
              <span>Saldo em {ddmm(to)}</span>
              <b className={`num ${close.endBalance < 0 ? "neg" : "pos"}`}>{formatMoney(close.endBalance)}</b>
            </div>
          </div>
          <div className="meter" title="Quanto das contas a pagar do mês já está coberto pelo saldo e pelo que vai entrar">
            <div style={{ width: `${Math.round(covered * 100)}%` }} />
          </div>
          <span className="small muted">
            {Math.round(covered * 100)}% das contas a pagar até {ddmm(to)} estão cobertas pelo saldo e pelo que vai entrar
          </span>
        </div>
        <div className="insight-focus">
          <h3>Onde focar</h3>
          <ul>
            {focus.slice(0, 5).map((f, i) => (
              <li key={i} className={f.tone}>
                <span>{f.text}</span>
                {f.href && (
                  <Link className="btn sm" href={f.href}>
                    {f.action}
                  </Link>
                )}
              </li>
            ))}
          </ul>
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
                <dt>A receber até {ddmm(to)}</dt>
                <dd className="pos">{formatMoney(p.close.receive)}</dd>
                <dt>A pagar até {ddmm(to)}</dt>
                <dd className="neg">{formatMoney(p.close.pay)}</dd>
                <dt>Saldo em {ddmm(to)}</dt>
                <dd className={p.close.endBalance < 0 ? "neg" : "pos"}>
                  <b>{formatMoney(p.close.endBalance)}</b>
                </dd>
              </dl>
              <MiniMonth close={p.close} />
            </Link>
          ))}
        </div>
      )}

      <div className="grid main-side">
        <div className="card table-wrap">
          <div className="panel-h">
            <h2>Próximas semanas</h2>
            <Link className="btn sm" href={`${base}/projecao`}>
              Projeção completa
            </Link>
          </div>
          <table className="weeks">
            <thead>
              <tr>
                <th>Semana</th>
                <th className="num">Entra</th>
                <th className="num">Sai</th>
                <th>Saldo no fim da semana</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={w.from} className={w.to > to && w.from <= to ? "month-break" : undefined}>
                  <td className="small">
                    {i === 0 ? "Esta semana" : `${ddmm(w.from)} a ${ddmm(w.to)}`}
                    {i === 0 && overdue.length > 0 && <div className="muted">inclui vencidas</div>}
                  </td>
                  <td className="num pos">{w.inflow ? formatMoney(w.inflow) : "—"}</td>
                  <td className="num neg">{w.outflow ? formatMoney(w.outflow) : "—"}</td>
                  <td>
                    <div className="wbar">
                      <div className={w.endBalance < 0 ? "neg-bar" : "pos-bar"} style={{ width: `${Math.max(2, (Math.abs(w.endBalance) / maxWeek) * 45)}%` }} />
                      <b className={`num ${w.endBalance < 0 ? "neg" : ""}`}>{formatMoney(w.endBalance)}</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted" style={{ marginTop: 8 }}>
            Só o que já está lançado. Contas ainda não emitidas não aparecem aqui.
          </p>
        </div>
        <div className="card">
          <div className="panel-h">
            <h2>Próximos vencimentos</h2>
            <Link className="btn sm" href={`${base}/pagar`}>
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

/** Faixa curta do fechamento do mês de uma empresa: verde se fecha positivo, vermelho com o que falta. */
function MiniMonth({ close }: { close: MonthClose }) {
  return close.shortfall ? (
    <span className="badge red">Faltam {formatMoney(close.shortfall)} para fechar o mês</span>
  ) : close.minBalance < 0 ? (
    <span className="badge amber">Fica negativo em {ddmm(close.minDate)}</span>
  ) : (
    <span className="badge green">Fecha o mês no verde</span>
  );
}
