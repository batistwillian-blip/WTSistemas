import Link from "next/link";
import type { CompanyWithRole } from "@/lib/access";
import { monthClose, monthOutlook, weekBuckets, type MonthClose } from "@/lib/finance";
import { addDays, addMonths, formatDate, formatMoney, monthEnd, monthStart, today } from "@/lib/format";
import { accountKindLabels, companyDescriptions } from "@/lib/labels";
import { accountBalances, launchedByMonth, monthlyTotals, pendingItems, realizedTotals, salesTotal, tipsFor } from "@/lib/queries";
import { greeting, verseOfDay } from "@/lib/verses";
import { roleAllows } from "@/lib/roles";
import { DueItem } from "./DueItem";
import { Money } from "./Money";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function sumBy<T>(list: T[], f: (t: T) => number) {
  return list.reduce((s, t) => s + f(t), 0);
}

const ddmm = (iso: string) => formatDate(iso).slice(0, 5);

type Focus = {
  tone: "red" | "amber" | "green" | "";
  text: React.ReactNode;
  href?: string;
  action?: string;
};

const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export async function Overview({
  companies,
  consolidated,
  month: requested,
  userName,
  head,
}: {
  companies: CompanyWithRole[];
  consolidated: boolean;
  /** Mês escolhido no topo (AAAA-MM); sem valor, o mês atual. Vai de 12 meses atrás a 12 à frente. */
  month?: string;
  userName: string;
  /** Cabeçalho da página, mostrado logo abaixo da saudação. */
  head?: React.ReactNode;
}) {
  const ids = companies.map((c) => c.id);
  const d0 = today();
  const [from, to] = [monthStart(d0), monthEnd(d0)];
  const current = d0.slice(0, 7);
  const minMonth = addMonths(from, -12).slice(0, 7);
  const maxMonth = addMonths(from, 12).slice(0, 7);
  const sel = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) && requested >= minMonth && requested <= maxMonth ? requested : current;
  const selFrom = `${sel}-01`;
  const selTo = monthEnd(selFrom);
  // Meses da previsão: do atual até 5 à frente (ou até o escolhido, se for mais longe).
  const lastOutlook = sel > addMonths(from, 5).slice(0, 7) ? sel : addMonths(from, 5).slice(0, 7);
  const outlookMonths: string[] = [];
  for (let m = from; m.slice(0, 7) <= lastOutlook; m = addMonths(m, 1)) outlookMonths.push(m.slice(0, 7));
  const backFrom = addMonths(from, -3);
  const backTo = addDays(from, -1);
  const nextMonthNum = (Number(sel.slice(5, 7)) % 12) + 1;
  const [balances, pending, month, sold, launched, realizedBack, selRealized, tips, nextTips, ...perMonth] = await Promise.all([
    accountBalances(ids),
    pendingItems(ids, monthEnd(`${lastOutlook}-01`)),
    realizedTotals(ids, from, to),
    salesTotal(ids, from, d0),
    launchedByMonth(ids, backFrom, backTo),
    monthlyTotals(ids, backFrom, backTo),
    sel < current ? realizedTotals(ids, selFrom, selTo) : Promise.resolve(null),
    tipsFor(ids, Number(sel.slice(5, 7))),
    tipsFor(ids, nextMonthNum),
    ...companies.map((c) => realizedTotals([c.id], from, to)),
  ]);
  // No consolidado, transferências entre as empresas se anulam e não são receita nem despesa.
  const relevant = consolidated ? pending.filter((p) => !p.transferId) : pending;
  const balance = sumBy(balances, (b) => b.balance);
  const close = monthClose(balance, relevant, d0, to);
  const outlook = monthOutlook(balance, relevant, d0, outlookMonths);
  const selOutlook = outlook.find((o) => o.month === sel) ?? null;
  const next6 = outlook.slice(0, 6);
  const maxAbs = Math.max(1, ...next6.map((o) => Math.abs(o.endBalance)));
  const back = [3, 2, 1].map((k) => {
    const m = addMonths(from, -k).slice(0, 7);
    const l = launched.find((x) => x.month === m) ?? { inflow: 0, outflow: 0 };
    const r = realizedBack.find((x) => x.month === m) ?? {
      inflow: 0,
      outflow: 0,
    };
    return {
      month: m,
      planIn: l.inflow,
      planOut: l.outflow,
      realIn: r.inflow,
      realOut: r.outflow,
    };
  });
  const verse = verseOfDay(d0);
  const firstName = userName.split(" ")[0];
  const nav = (m: string) => (m === current ? base : `${base}?mes=${m}`);
  const prevMonth = addMonths(selFrom, -1).slice(0, 7);
  const nextMonth = addMonths(selFrom, 1).slice(0, 7);
  const tipCompany = (id: number) => byId.get(id);
  const selBiggest = relevant
    .filter((p) => p.type === "saida" && p.dueDate.slice(0, 7) === sel)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  const weeks = weekBuckets(balance, relevant, d0, 8);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const monthName = MONTHS[Number(d0.slice(5, 7)) - 1];
  const base = consolidated ? "/consolidado" : `/empresa/${companies[0].slug}`;

  const perCompany = companies.map((c, i) => {
    const b = sumBy(
      balances.filter((x) => x.companyId === c.id),
      (x) => x.balance,
    );
    return {
      company: c,
      balance: b,
      close: monthClose(
        b,
        pending.filter((p) => p.companyId === c.id),
        d0,
        to,
      ),
      month: perMonth[i],
    };
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
          <b>
            {overdueOut.length} {overdueOut.length === 1 ? "conta vencida" : "contas vencidas"} a pagar
          </b>{" "}
          ({formatMoney(sumBy(overdueOut, (p) => p.amount))}): pagar ou renegociar.
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
          <b>
            Cobrar {overdueIn.length} {overdueIn.length === 1 ? "recebimento atrasado" : "recebimentos atrasados"}
          </b>{" "}
          ({formatMoney(sumBy(overdueIn, (p) => p.amount))}).
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
          Maior conta até o fim do mês: <b>{p.description.length > 48 ? p.description.slice(0, 46) + "…" : p.description}</b>{" "}
          {consolidated ? `(${byId.get(p.companyId)?.name}) ` : ""}— {formatMoney(p.amount)} em {ddmm(p.dueDate)}.
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
  if (!focus.length)
    focus.push({
      tone: "green",
      text: <>Tudo em dia: nenhuma conta vencida e o mês fecha no verde.</>,
    });

  const covered = close.pay ? Math.min(1, Math.max(0, (balance + close.receive) / close.pay)) : 1;
  const maxWeek = Math.max(1, ...weeks.map((w) => Math.abs(w.endBalance)), ...weeks.map((w) => Math.max(w.inflow, w.outflow)));
  const upcoming = relevant.slice(0, 8);

  return (
    <div className="stack">
      <div className="hello">
        <div>
          <h1>
            {greeting()}, {firstName}!
          </h1>
          <blockquote>
            “{verse.text}” <cite>{verse.ref}</cite>
          </blockquote>
        </div>
      </div>
      {head}
      <div className="bills-bar">
        <div className="month-nav">
          {sel > minMonth && (
            <Link className="btn sm" href={nav(prevMonth)} aria-label="Mês anterior">
              ‹
            </Link>
          )}
          <h2>{cap(monthLabel(sel))}</h2>
          {sel < maxMonth && (
            <Link className="btn sm" href={nav(nextMonth)} aria-label="Próximo mês">
              ›
            </Link>
          )}
          {sel !== current && (
            <Link className="btn sm" href={nav(current)}>
              Mês atual
            </Link>
          )}
        </div>
      </div>

      {sel !== current && selOutlook && (
        <div className={`card insight ${selOutlook.shortfall ? "bad" : "good"}`}>
          <div className="insight-main">
            <span className="eyebrow">Previsão de {monthLabel(sel)} · só o que já está lançado</span>
            {selOutlook.shortfall ? (
              <h2>
                Faltam <span className="num neg">{formatMoney(selOutlook.shortfall)}</span> para fechar {MONTHS[Number(sel.slice(5, 7)) - 1]} no verde
              </h2>
            ) : (
              <h2>
                {cap(MONTHS[Number(sel.slice(5, 7)) - 1])} fecha no verde, com <span className="num pos">{formatMoney(selOutlook.endBalance)}</span>
              </h2>
            )}
            <p className="small">
              {selOutlook.target
                ? `Para pagar as contas do mês é preciso faturar ${formatMoney(selOutlook.target)} além do que já está lançado para receber.`
                : "O que está lançado para receber no mês já cobre as contas do mês."}
            </p>
            <div className="eq">
              <div>
                <span>Saldo previsto em 01/{sel.slice(5, 7)}</span>
                <b className={`num ${selOutlook.startBalance < 0 ? "neg" : ""}`}>{formatMoney(selOutlook.startBalance)}</b>
              </div>
              <i>+</i>
              <div>
                <span>A receber no mês</span>
                <b className="num pos">{formatMoney(selOutlook.receive)}</b>
              </div>
              <i>−</i>
              <div>
                <span>A pagar no mês</span>
                <b className="num neg">{formatMoney(selOutlook.pay)}</b>
              </div>
              <i>=</i>
              <div>
                <span>Saldo em {ddmm(selTo)}</span>
                <b className={`num ${selOutlook.endBalance < 0 ? "neg" : "pos"}`}>{formatMoney(selOutlook.endBalance)}</b>
              </div>
            </div>
          </div>
          <div className="insight-focus">
            <h3>Maiores contas de {MONTHS[Number(sel.slice(5, 7)) - 1]}</h3>
            <ul>
              {selBiggest.length === 0 && <li>Nenhuma conta a pagar lançada para o mês.</li>}
              {selBiggest.map((p) => (
                <li key={p.id}>
                  <span>
                    <b>{p.description.length > 40 ? p.description.slice(0, 38) + "…" : p.description}</b>
                    {consolidated ? ` (${byId.get(p.companyId)?.name})` : ""} — {formatMoney(p.amount)} em {ddmm(p.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
            <Link className="btn sm" href={`${base}/pagar?mes=${sel}`}>
              Ver contas do mês
            </Link>
          </div>
        </div>
      )}

      {sel < current && selRealized && (
        <div className={`card insight ${selRealized.inflow - selRealized.outflow < 0 ? "bad" : "good"}`}>
          <div className="insight-main">
            <span className="eyebrow">{cap(monthLabel(sel))} · realizado</span>
            <h2>
              Resultado de{" "}
              <span className={`num ${selRealized.inflow - selRealized.outflow < 0 ? "neg" : "pos"}`}>
                {formatMoney(selRealized.inflow - selRealized.outflow)}
              </span>
            </h2>
            <div className="eq">
              <div>
                <span>Entrou</span>
                <b className="num pos">{formatMoney(selRealized.inflow)}</b>
              </div>
              <i>−</i>
              <div>
                <span>Saiu</span>
                <b className="num neg">{formatMoney(selRealized.outflow)}</b>
              </div>
              <i>=</i>
              <div>
                <span>Resultado</span>
                <b className={`num ${selRealized.inflow - selRealized.outflow < 0 ? "neg" : "pos"}`}>{formatMoney(selRealized.inflow - selRealized.outflow)}</b>
              </div>
            </div>
          </div>
          <div className="insight-focus">
            <h3>Ver o mês</h3>
            <ul>
              <li>
                <span>Contas pagas e recebidas, por categoria e fornecedor.</span>
                <Link className="btn sm" href={`${base}/pagar?mes=${sel}`}>
                  Pagar
                </Link>
              </li>
              <li>
                <span>Relatório completo do mês.</span>
                <Link className="btn sm" href={`${base}/relatorios?mes=${sel}`}>
                  Relatórios
                </Link>
              </li>
            </ul>
          </div>
        </div>
      )}

      {sel === current && (
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
      )}

      <div className="card table-wrap">
        <div className="panel-h">
          <h2>Próximos 6 meses</h2>
          <span className="small muted">só o que já está lançado</span>
        </div>
        <table className="months6">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">A receber</th>
              <th className="num">A pagar</th>
              <th className="num">Resultado</th>
              <th>Saldo no fim do mês</th>
              <th className="num" title="Quanto faturar a mais para pagar as contas do próprio mês">
                Meta de faturamento
              </th>
            </tr>
          </thead>
          <tbody>
            {next6.map((o) => (
              <tr key={o.month} className={`${o.endBalance < 0 ? "red-row" : ""}${o.month === sel ? " sel" : ""}`}>
                <td>
                  <Link href={nav(o.month)}>{cap(MONTHS[Number(o.month.slice(5, 7)) - 1])}</Link>
                  {o.month === current && <div className="small muted">inclui vencidas</div>}
                </td>
                <td className="num pos">{formatMoney(o.receive)}</td>
                <td className="num neg">{formatMoney(o.pay)}</td>
                <td className={`num ${o.result < 0 ? "neg" : "pos"}`}>{formatMoney(o.result)}</td>
                <td>
                  <div className="wbar">
                    <div
                      className={o.endBalance < 0 ? "neg-bar" : "pos-bar"}
                      style={{
                        width: `${Math.max(2, (Math.abs(o.endBalance) / maxAbs) * 45)}%`,
                      }}
                    />
                    <b className={`num ${o.endBalance < 0 ? "neg" : ""}`}>{formatMoney(o.endBalance)}</b>
                  </div>
                </td>
                <td className="num">{o.target ? <b className="neg">{formatMoney(o.target)}</b> : <span className="badge green">coberto</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginTop: 8 }}>
          Meta de faturamento: quanto ainda precisa entrar, além do que já está lançado a receber, para pagar as contas daquele mês. Meses em vermelho terminam
          com saldo negativo: dá tempo de planejar campanha, antecipar recebimentos ou renegociar.
        </p>
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
                      <div
                        className={w.endBalance < 0 ? "neg-bar" : "pos-bar"}
                        style={{
                          width: `${Math.max(2, (Math.abs(w.endBalance) / maxWeek) * 45)}%`,
                        }}
                      />
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
        <div className="stack">
          <div className="card tips">
            <div className="panel-h">
              <h2>Dicas para {MONTHS[Number(sel.slice(5, 7)) - 1]}</h2>
            </div>
            {tips.length === 0 && <p className="muted small">Nenhuma dica cadastrada para este mês. Dá para criar em Ajustes da empresa.</p>}
            {tips.map((t) => (
              <div key={t.id} className="tip">
                {consolidated && (
                  <span className="emp small">
                    <span className="dot" style={{ background: tipCompany(t.companyId)?.color }} />
                    {tipCompany(t.companyId)?.name}
                  </span>
                )}
                <b>{t.title}</b>
                <p>{t.text}</p>
              </div>
            ))}
            {nextTips.length > 0 && (
              <div className="tip next">
                <span className="eyebrow">Prepare-se para {MONTHS[nextMonthNum - 1]}</span>
                {nextTips.map((t) => (
                  <p key={t.id}>
                    {consolidated && <b>{tipCompany(t.companyId)?.name}: </b>}
                    {t.title}
                  </p>
                ))}
              </div>
            )}
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
                    accounts={balances.filter((a) => a.companyId === p.companyId && (a.active || a.id === p.accountId))}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="grid k2">
        <div className="card">
          <h2>Realizado em {monthName}</h2>
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
                        <span
                          className="dot"
                          style={{
                            background: byId.get(b.companyId)?.color,
                            marginRight: 8,
                          }}
                          title={byId.get(b.companyId)?.name}
                        />
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

      <div className="card table-wrap">
        <div className="panel-h">
          <h2>Últimos 3 meses: previsto × realizado</h2>
          <span className="small muted">previsto = contas lançadas com vencimento no mês; realizado = o que entrou e saiu de fato</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Entradas previstas</th>
              <th className="num">Entradas realizadas</th>
              <th className="num">Saídas previstas</th>
              <th className="num">Saídas realizadas</th>
              <th className="num">Resultado realizado</th>
            </tr>
          </thead>
          <tbody>
            {back.map((b) => (
              <tr key={b.month}>
                <td>
                  <Link href={nav(b.month)}>{cap(MONTHS[Number(b.month.slice(5, 7)) - 1])}</Link>
                </td>
                <td className="num">{formatMoney(b.planIn)}</td>
                <td className="num pos">
                  {formatMoney(b.realIn)} <Delta plan={b.planIn} real={b.realIn} good="up" />
                </td>
                <td className="num">{formatMoney(b.planOut)}</td>
                <td className="num neg">
                  {formatMoney(b.realOut)} <Delta plan={b.planOut} real={b.realOut} good="down" />
                </td>
                <td className={`num ${b.realIn - b.realOut < 0 ? "neg" : "pos"}`}>{formatMoney(b.realIn - b.realOut)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Diferença do realizado contra o previsto, em %, verde quando é bom (entrou mais ou saiu menos). */
function Delta({ plan, real, good }: { plan: number; real: number; good: "up" | "down" }) {
  if (!plan) return null;
  const pct = Math.round(((real - plan) / plan) * 100);
  if (pct === 0) return null;
  const ok = good === "up" ? pct > 0 : pct < 0;
  return (
    <span className={`badge ${ok ? "green" : "red"}`}>
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
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
