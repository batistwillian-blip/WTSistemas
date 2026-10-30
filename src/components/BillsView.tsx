import Link from "next/link";
import { setPaid } from "@/app/actions/lancamentos";
import type { CompanyWithRole } from "@/lib/access";
import { installmentLabel } from "@/lib/billing";
import {
  applyFilters,
  billRange,
  byCategory,
  categoryOf,
  dateOf,
  monthNav,
  partyProfile,
  readBillFilters,
  situation,
  summarize,
  weekGroups,
  type BillFilters,
} from "@/lib/bills";
import { addDays, formatDate, formatMoney, today } from "@/lib/format";
import { billsInRange, getAccounts, partiesOf, pendingItems } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { SettleButton } from "./SettleButton";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthTitle = (m: string) => {
  const name = MONTHS[Number(m.slice(5, 7)) - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} de ${m.slice(0, 4)}`;
};
const ddmm = (iso: string) => formatDate(iso).slice(0, 5);

/**
 * Contas a pagar ou a receber de uma empresa (ou do consolidado), organizadas por mês:
 * navegação entre meses, totais do mês que também filtram, filtros, lista por semana e resumo por categoria.
 */
export async function BillsView({
  companies,
  consolidated,
  type,
  searchParams,
  basePath,
}: {
  companies: CompanyWithRole[];
  consolidated: boolean;
  type: "entrada" | "saida";
  searchParams: Record<string, string | string[] | undefined>;
  basePath: string;
}) {
  const d0 = today();
  const f = readBillFilters(searchParams, d0);
  const ids = companies.map((c) => c.id);
  const byId = new Map(companies.map((c) => [c.id, c]));
  const { from, to } = billRange(f, d0);
  const [all, accs, pending, partyList, partyRows] = await Promise.all([
    billsInRange(ids, type, f.base, from, to, consolidated, f.party || undefined),
    getAccounts(ids),
    f.month === "todas" ? Promise.resolve([]) : pendingItems(ids, addDays(from, -1)),
    partiesOf(ids, type),
    // Ficha do fornecedor/cliente: tudo dele, de todos os meses.
    f.party ? billsInRange(ids, type, "vencimento", "1900-01-01", "2999-12-31", consolidated, f.party) : Promise.resolve(null),
  ]);
  const profile = partyRows ? partyProfile(partyRows, d0) : null;
  // Vencidas que ficaram para trás em meses anteriores: aviso no topo para não se perderem.
  const lateBefore = pending.filter(
    (p) => p.type === type && p.dueDate < from && !(consolidated && p.transferId) && (!f.party || p.counterpart === f.party),
  );

  // Totais e categorias usam o mês inteiro com os filtros de categoria/conta/busca, mas sem o de situação
  // (assim os cartões mostram previsto, pago, em aberto e vencido lado a lado).
  const scoped = applyFilters(all, { ...f, status: "todas" }, d0);
  const totals = summarize(scoped, d0);
  // O resumo por categoria ignora o próprio filtro de categoria, para dar para trocar de uma para outra.
  const cats = byCategory(f.category ? applyFilters(all, { ...f, status: "todas", category: "" }, d0) : scoped);
  const catSum = cats.reduce((a, c) => a + c.total, 0);
  const list = applyFilters(all, f, d0);
  const groups = weekGroups(list, f.base);

  const entrada = type === "entrada";
  const words = entrada
    ? { paid: "Recebidas", open: "A receber", verb: "receber", party: "Clientes" }
    : { paid: "Pagas", open: "A pagar", verb: "pagar", party: "Fornecedores" };
  const tone = entrada ? "pos" : "neg";

  const qs = (patch: Partial<Record<"mes" | "de" | "ate" | "situacao" | "ver" | "categoria" | "conta" | "q" | "fornecedor", string | null>>) => {
    // Trocar de mês desliga o período por datas.
    if ("mes" in patch) patch = { de: null, ate: null, ...patch };
    const cur: Record<string, string> = {
      mes: f.month === d0.slice(0, 7) || f.month === "periodo" ? "" : f.month,
      de: f.from ?? "",
      ate: f.to ?? "",
      fornecedor: f.party,
      situacao: f.status === "todas" ? "" : f.status,
      ver: f.base === "vencimento" ? "" : f.base,
      categoria: f.category,
      conta: f.account ? String(f.account) : "",
      q: f.q,
    };
    for (const [k, v] of Object.entries(patch)) cur[k] = v ?? "";
    const p = new URLSearchParams(Object.entries(cur).filter(([, v]) => v));
    const s = p.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const nav = f.month === "todas" || f.month === "periodo" ? null : monthNav(f.month);
  const periodWord = f.month === "todas" || f.month === "periodo" ? "período" : "mês";
  const cards: { key: BillFilters["status"]; label: string; value: number; count: number; cls: string }[] = [
    { key: "todas", label: `Total do ${periodWord}`, value: totals.total, count: totals.totalCount, cls: tone },
    { key: "pagas", label: words.paid, value: totals.paid, count: totals.paidCount, cls: "" },
    { key: "aberto", label: words.open, value: totals.open, count: totals.openCount, cls: tone },
    { key: "vencidas", label: "Vencidas", value: totals.overdue, count: totals.overdueCount, cls: totals.overdueCount ? "neg" : "" },
  ];
  const progress = totals.total ? Math.round((totals.paid / totals.total) * 100) : 0;
  const parties = topParties(scoped);
  const accountOptions = accs.filter((a) => a.active || a.id === f.account);
  const filtered = Boolean(f.category || f.account || f.q || f.party);
  const partyWord = entrada ? "Cliente" : "Fornecedor";

  return (
    <div className="stack">
      {/* Mês e modo de ver */}
      <div className="bills-bar">
        <div className="month-nav">
          {nav ? (
            <>
              <Link className="btn sm" href={qs({ mes: nav.prev })} aria-label="Mês anterior">
                ‹
              </Link>
              <h2>{monthTitle(f.month)}</h2>
              <Link className="btn sm" href={qs({ mes: nav.next })} aria-label="Próximo mês">
                ›
              </Link>
              {f.month !== d0.slice(0, 7) && (
                <Link className="btn sm" href={qs({ mes: null })}>
                  Mês atual
                </Link>
              )}
              <Link className="btn sm" href={qs({ mes: "todas" })}>
                Todo o período
              </Link>
            </>
          ) : (
            <>
              <h2>{f.month === "periodo" ? `${formatDate(f.from)} a ${formatDate(f.to)}` : "Todo o período"}</h2>
              <Link className="btn sm" href={qs({ mes: null })}>
                Voltar ao mês atual
              </Link>
            </>
          )}
        </div>
        <div className="tabs" title="Qual data posiciona a conta no mês">
          {(
            [
              ["vencimento", "Por vencimento"],
              ["pagamento", `Por ${entrada ? "recebimento" : "pagamento"}`],
              ["competencia", "Por competência"],
            ] as const
          ).map(([k, l]) => (
            <Link key={k} href={qs({ ver: k === "vencimento" ? null : k })} className={f.base === k ? "on" : undefined}>
              {l}
            </Link>
          ))}
        </div>
      </div>

      {lateBefore.length > 0 && (
        <div className="alert error" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <span>
            {lateBefore.length === 1 ? "Há 1 conta vencida" : `Há ${lateBefore.length} contas vencidas`} de meses anteriores ainda em aberto:{" "}
            <b className="num">{formatMoney(lateBefore.reduce((s, p) => s + p.amount, 0))}</b>
          </span>
          <Link className="btn sm" href={`${basePath}?situacao=vencidas&mes=todas`}>
            Ver todas as vencidas
          </Link>
        </div>
      )}

      {profile && (
        <div className="card party">
          <div className="panel-h">
            <div>
              <span className="eyebrow">{partyWord} · todo o período</span>
              <h2 style={{ margin: "2px 0 0" }}>{f.party}</h2>
            </div>
            <span style={{ display: "flex", gap: 8 }}>
              {f.month !== "todas" && (
                <Link className="btn sm" href={qs({ mes: "todas" })}>
                  Ver todas as contas dele
                </Link>
              )}
              <Link className="btn sm" href={qs({ fornecedor: null })}>
                Tirar filtro
              </Link>
            </span>
          </div>
          <div className="party-grid">
            <div>
              <span className="label">{entrada ? "Já recebido" : "Já pago"}</span>
              <b className="num">{formatMoney(profile.paid)}</b>
              <span className="sub">
                {profile.paidCount} {profile.paidCount === 1 ? "conta" : "contas"}
                {profile.lastPaid && ` · último em ${formatDate(profile.lastPaid)}`}
              </span>
            </div>
            <div>
              <span className="label">Falta {words.verb}</span>
              <b className={`num ${tone}`}>{formatMoney(profile.open)}</b>
              <span className="sub">
                {profile.openCount} {profile.openCount === 1 ? "conta" : "contas"}
              </span>
            </div>
            <div>
              <span className="label">Vencido</span>
              <b className={`num ${profile.overdueCount ? "neg" : ""}`}>{formatMoney(profile.overdue)}</b>
              <span className="sub">
                {profile.overdueCount} {profile.overdueCount === 1 ? "conta" : "contas"}
              </span>
            </div>
            <div>
              <span className="label">Próximo vencimento</span>
              <b className="num">{profile.next ? formatMoney(profile.next.amount) : "—"}</b>
              <span className="sub">{profile.next ? `${formatDate(profile.next.dueDate)}${installmentLabel(profile.next) ? ` · parcela ${installmentLabel(profile.next)}` : ""}` : "nada a vencer"}</span>
            </div>
            <div>
              <span className="label">Total geral</span>
              <b className="num">{formatMoney(profile.total)}</b>
              <span className="sub">{profile.total ? Math.round((profile.paid / profile.total) * 100) : 0}% quitado</span>
            </div>
          </div>
          {profile.months.some((m) => m.value > 0) && (
            <div className="party-months" aria-label={`${entrada ? "Recebido" : "Pago"} por mês nos últimos 12 meses`}>
              {profile.months.map((m) => {
                const max = Math.max(...profile.months.map((x) => x.value));
                return (
                  <Link key={m.month} href={qs({ mes: m.month, ver: "pagamento" })} title={`${monthTitle(m.month)}: ${formatMoney(m.value)}`}>
                    <span className="pm-bar">
                      <span style={{ height: `${max ? Math.max(m.value ? 4 : 0, Math.round((m.value / max) * 100)) : 0}%` }} />
                    </span>
                    <small>{SHORT[Number(m.month.slice(5, 7)) - 1]}</small>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Totais do mês: clicar filtra a lista */}
      <div className="grid k4 bill-cards">
        {cards.map((c) => (
          <Link key={c.key} href={qs({ situacao: c.key === "todas" ? null : c.key })} className={`card kpi${f.status === c.key ? " on" : ""}`}>
            <span className="label">{c.label}</span>
            <span className={`value ${c.cls}`}>{formatMoney(c.value)}</span>
            <span className="sub">
              {c.count} {c.count === 1 ? "conta" : "contas"}
              {c.key === "pagas" && totals.total > 0 && ` · ${progress}% do ${periodWord}`}
            </span>
          </Link>
        ))}
      </div>
      {totals.total > 0 && (
        <div className="meter" title={`${progress}% ${entrada ? "recebido" : "pago"}`}>
          <div style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Filtros */}
      <form method="get" className="card filters">
        {f.month !== d0.slice(0, 7) && f.month !== "periodo" && <input type="hidden" name="mes" value={f.month} />}
        {f.status !== "todas" && <input type="hidden" name="situacao" value={f.status} />}
        {f.base !== "vencimento" && <input type="hidden" name="ver" value={f.base} />}
        <label>
          Categoria
          <select name="categoria" defaultValue={f.category}>
            <option value="">Todas</option>
            {[...new Set([...cats.map((c) => c.name), ...(f.category ? [f.category] : [])])]
              .sort((a, b) => a.localeCompare(b, "pt-BR"))
              .map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
          </select>
        </label>
        <label>
          Conta
          <select name="conta" defaultValue={f.account ?? ""}>
            <option value="">Todas</option>
            {accountOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {consolidated ? `${byId.get(a.companyId)?.name} · ` : ""}
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ minWidth: 200 }}>
          {partyWord}
          <input name="fornecedor" list="bill-parties" defaultValue={f.party} placeholder={`Todos (digite ou escolha)`} autoComplete="off" />
          <datalist id="bill-parties">
            {partyList.map((p) => (
              <option key={p.name} value={p.name}>
                {p.count} {p.count === 1 ? "conta" : "contas"}
              </option>
            ))}
          </datalist>
        </label>
        <label style={{ minWidth: 130 }}>
          De
          <input type="date" name="de" defaultValue={f.from ?? ""} />
        </label>
        <label style={{ minWidth: 130 }}>
          Até
          <input type="date" name="ate" defaultValue={f.to ?? ""} />
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          Buscar
          <input name="q" defaultValue={f.q} placeholder={`Descrição, ${entrada ? "cliente" : "fornecedor"} ou nº do documento`} />
        </label>
        <button className="btn" type="submit">
          Filtrar
        </button>
        {filtered && (
          <Link className="btn" href={qs({ categoria: null, conta: null, q: null, fornecedor: null })}>
            Limpar
          </Link>
        )}
        <a className="btn" href={`${basePath}/exportar?${new URLSearchParams(Object.entries(searchParams).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])))}`}>
          Exportar (Excel)
        </a>
      </form>

      <div className="grid main-side">
        {/* Lista por semana */}
        <div className="card">
          <div className="panel-h">
            <h2>
              {f.status === "todas" ? "Todas as contas" : cards.find((c) => c.key === f.status)?.label}
              {filtered && <span className="muted small"> · filtradas</span>}
            </h2>
            <span className={`num ${tone}`}>
              {formatMoney(list.filter((r) => !r.offBalance).reduce((s, r) => s + r.amount, 0))} · {list.length} {list.length === 1 ? "conta" : "contas"}
            </span>
          </div>
          {list.length === 0 && <p className="muted">Nenhuma conta {nav ? "neste mês " : "no período "}com esses filtros.</p>}
          {groups.map((g) => {
            const sub = g.rows.filter((r) => !r.offBalance).reduce((s, r) => s + r.amount, 0);
            const current = g.start <= d0 && d0 <= g.end;
            return (
              <div key={g.start} className="week">
                <div className="week-h">
                  <span className="eyebrow">
                    Semana de {ddmm(g.start)} a {ddmm(g.end)}
                    {current && <span className="badge amber" style={{ marginLeft: 6 }}>esta semana</span>}
                  </span>
                  <span className="num small muted">{formatMoney(sub)}</span>
                </div>
                <div className="list">
                  {g.rows.map((r) => {
                    const c = byId.get(r.companyId)!;
                    const s = situation(r, d0);
                    const day = dateOf(r, f.base === "competencia" ? "vencimento" : f.base);
                    const canLaunch = roleAllows(c.role, "lancar") && r.source === "manual";
                    const parcel = installmentLabel(r);
                    const badge =
                      s === "paga"
                        ? [`${entrada ? "Recebida" : "Paga"} ${ddmm(r.paidAt!)}`, "green"]
                        : s === "vencida"
                          ? [`Vencida há ${Math.round((Date.parse(d0) - Date.parse(r.dueDate)) / 86_400_000)}d`, "red"]
                          : s === "hoje"
                            ? ["Vence hoje", "amber"]
                            : [r.dueDate <= addDays(d0, 7) ? `Vence ${ddmm(r.dueDate)}` : "A vencer", r.dueDate <= addDays(d0, 7) ? "amber" : ""];
                    return (
                      <div key={r.id} className={`li bill${s === "paga" ? " done" : ""}`}>
                        <div className="date-box">
                          <b>{day.slice(8, 10)}</b>
                          <small>{SHORT[Number(day.slice(5, 7)) - 1]}</small>
                        </div>
                        <div>
                          <div className="t">
                            {canLaunch && !r.transferId ? (
                              <Link href={`/empresa/${c.slug}/lancamentos/${r.partialOf ?? r.id}`} style={{ color: "inherit" }}>
                                {r.description}
                              </Link>
                            ) : (
                              r.description
                            )}{" "}
                            {parcel && <span className="badge">parcela {parcel}</span>} {r.partialOf && <span className="badge amber">parcial</span>}{" "}
                            {r.originalAmount !== null && !r.paidAt && <span className="badge amber">restante de {formatMoney(r.originalAmount)}</span>}{" "}
                            {r.offBalance ? <span className="badge">só consulta</span> : r.source === "chserver" ? <span className="badge blue">CHServer</span> : null}
                          </div>
                          <div className="m">
                            {consolidated && (
                              <span className="emp" style={{ marginRight: 8 }}>
                                <span className="dot" style={{ background: c.color }} />
                                {c.name}
                              </span>
                            )}
                            {r.document && <span className="doc">Doc {r.document} · </span>}
                            {categoryOf(r)}
                            {r.counterpart && (
                              <>
                                {" · "}
                                <Link href={qs({ fornecedor: r.counterpart })} title={`Ver só ${r.counterpart}`}>
                                  {r.counterpart}
                                </Link>
                              </>
                            )}
                            {f.base !== "vencimento" && <> · vence {ddmm(r.dueDate)}</>}
                            {r.paidAt && !r.offBalance && <> · {r.accountName}</>}
                          </div>
                        </div>
                        <div className="li-r">
                          <b className={`num ${s === "paga" ? "" : tone}`}>
                            {formatMoney(r.amount)}
                            {(r.interest > 0 || r.discount > 0) && (
                              <span className="small muted" style={{ fontWeight: 400 }}>
                                {" "}
                                ({r.interest > 0 ? `juros ${formatMoney(r.interest)}` : `desc. ${formatMoney(r.discount)}`})
                              </span>
                            )}
                          </b>
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span className={`badge ${badge[1]}`}>{badge[0]}</span>
                            {canLaunch && !r.paidAt && !r.transferId && (
                              <SettleButton item={r} accounts={accs.filter((a) => a.companyId === r.companyId && (a.active || a.id === r.accountId))} today={d0} />
                            )}
                            {canLaunch && !r.paidAt && r.transferId && (
                              <form action={setPaid}>
                                <input type="hidden" name="id" value={r.id} />
                                <button className="btn sm" type="submit">
                                  Baixar
                                </button>
                              </form>
                            )}
                            {canLaunch && r.paidAt && !r.offBalance && !r.parentPaid && (
                              <form action={setPaid}>
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="undo" value="1" />
                                <button className="btn sm" type="submit" title="Desfazer a baixa: a conta volta a ficar em aberto">
                                  Estornar
                                </button>
                              </form>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {totals.consultCount > 0 && f.status !== "aberto" && f.status !== "vencidas" && (
            <p className="help" style={{ marginTop: 10 }}>
              {totals.consultCount} {totals.consultCount === 1 ? "conta paga veio" : "contas pagas vieram"} do CHServer só para consulta ({formatMoney(totals.consult)}): aparecem
              na lista, mas não entram nos totais nem no saldo do caixa.
            </p>
          )}
        </div>

        {/* Resumo lateral */}
        <div className="stack">
          <div className="card">
            <div className="panel-h">
              <h2>Por categoria</h2>
            </div>
            {cats.length === 0 && <p className="muted small">Nada no mês.</p>}
            <div className="cat-bars">
              {cats.slice(0, 10).map((c) => (
                <Link key={c.name} href={qs({ categoria: f.category === c.name ? null : c.name })} className={f.category === c.name ? "on" : undefined}>
                  <span className="cb-top">
                    <span>{c.name}</span>
                    <span className="num">{formatMoney(c.total)}</span>
                  </span>
                  <span className="cb-bar">
                    <span style={{ width: `${Math.max(2, Math.round((c.total / cats[0].total) * 100))}%` }} />
                  </span>
                  <span className="small muted">{catSum ? Math.round((c.total / catSum) * 100) : 0}% do mês</span>
                </Link>
              ))}
            </div>
          </div>
          {parties.length > 0 && (
            <div className="card">
              <div className="panel-h">
                <h2>Maiores {words.party.toLowerCase()}</h2>
              </div>
              <div className="list">
                {parties.map((p) => (
                  <Link key={p.name} href={qs({ fornecedor: p.name })} className="li" style={{ gridTemplateColumns: "minmax(0,1fr) auto", color: "inherit" }}>
                    <span>
                      {p.name} <span className="small muted">· {p.count}</span>
                    </span>
                    <span className="num">{formatMoney(p.total)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function topParties(rows: { counterpart: string | null; amount: number; offBalance: boolean }[]) {
  const m = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    if (!r.counterpart || r.offBalance) continue;
    const e = m.get(r.counterpart) ?? { total: 0, count: 0 };
    e.total += r.amount;
    e.count += 1;
    m.set(r.counterpart, e);
  }
  return [...m.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}
