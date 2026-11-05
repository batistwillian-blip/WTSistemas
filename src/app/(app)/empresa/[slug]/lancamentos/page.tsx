import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { setPaid } from "@/app/actions/lancamentos";
import { DeleteButton } from "@/components/DeleteButton";
import { Money } from "@/components/Money";
import { SettleButton } from "@/components/SettleButton";
import { installmentLabel } from "@/lib/billing";
import { requireCompany } from "@/lib/access";
import { formatDate, formatMoney, monthEnd, today } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";
import { getAccounts, listTransactions } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";

export default async function LancamentosPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company, role } = await requireCompany(slug);

  const mes = param(sp, "mes");
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : today().slice(0, 7);
  const tipo = param(sp, "tipo");
  const status = param(sp, "status");
  const q = param(sp, "q")?.slice(0, 100) ?? "";
  const conta = Number(param(sp, "conta")) || undefined;

  const [rows, accounts] = await Promise.all([
    listTransactions(company.id, {
      from: `${month}-01`,
      to: monthEnd(`${month}-01`),
      type: tipo === "entrada" || tipo === "saida" ? tipo : undefined,
      status: status === "pago" || status === "pendente" ? status : undefined,
      q,
      accountId: conta,
    }),
    getAccounts([company.id]),
  ]);

  const d0 = today();
  // Mesmo critério da visão geral: transferências e ajustes não contam como entrada ou saída.
  // Baixa com data futura (agendada) ainda não aconteceu: fica fora do realizado e do saldo até o dia.
  const realized = rows.filter((r) => r.tx.paidAt && r.tx.paidAt <= d0 && !r.tx.transferId && !r.tx.balanceAdjustment);
  const scheduled = rows.filter((r) => r.tx.paidAt && r.tx.paidAt > d0 && !r.tx.transferId);
  const scheduledNet = scheduled.reduce((s, r) => s + (r.tx.type === "entrada" ? r.tx.amount : -r.tx.amount), 0);
  const paidIn = realized.filter((r) => r.tx.type === "entrada").reduce((s, r) => s + r.tx.amount, 0);
  const paidOut = realized.filter((r) => r.tx.type === "saida").reduce((s, r) => s + r.tx.amount, 0);
  const canLaunch = roleAllows(role, "lancar");

  return (
    <div className="stack">
      <PageHead
        context={company.name}
        color={company.color}
        title="Lançamentos"
        action={canLaunch ? { href: `/empresa/${slug}/lancamentos/novo`, label: "+ Novo lançamento" } : undefined}
      />
      <div className="card sumrow">
        <div>
          <span className="eyebrow">Entradas realizadas</span>
          <span className="v pos">{formatMoney(paidIn)}</span>
        </div>
        <div>
          <span className="eyebrow">Saídas realizadas</span>
          <span className="v neg">{formatMoney(paidOut)}</span>
        </div>
        <div>
          <span className="eyebrow">Resultado</span>
          <span className={`v ${paidIn - paidOut < 0 ? "neg" : ""}`}>{formatMoney(paidIn - paidOut)}</span>
        </div>
        <div className="small muted" style={{ alignSelf: "flex-end" }}>
          No filtro abaixo, até hoje, sem contar transferências entre empresas.
          {scheduled.length > 0 && (
            <>
              {" "}
              <b className="amber-text">
                {scheduled.length} {scheduled.length === 1 ? "baixa agendada" : "baixas agendadas"} para depois de hoje ({formatMoney(scheduledNet)}): só entram no saldo na data.
              </b>
            </>
          )}
        </div>
      </div>

      <form className="filters card" method="get">
        <label>
          Mês
          <input type="month" name="mes" defaultValue={month} />
        </label>
        <label>
          Tipo
          <select name="tipo" defaultValue={tipo ?? ""}>
            <option value="">Todos</option>
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas</option>
          </select>
        </label>
        <label>
          Situação
          <select name="status" defaultValue={status ?? ""}>
            <option value="">Todas</option>
            <option value="pago">Pago / recebido</option>
            <option value="pendente">Pendente</option>
          </select>
        </label>
        <label>
          Conta
          <select name="conta" defaultValue={conta ?? ""}>
            <option value="">Todas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Buscar
          <input name="q" defaultValue={q} placeholder="Descrição, cliente/fornecedor ou nº doc" />
        </label>
        <button className="btn" type="submit">
          Filtrar
        </button>
      </form>

      <div className="card table-wrap">
        {rows.length === 0 ? (
          <p className="muted">Nenhum lançamento neste filtro.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Conta</th>
                <th>Situação</th>
                <th className="num">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ tx, accountName, categoryName, seriesOpen, seriesOpenFrom }) => {
                const manual = tx.source === "manual";
                const overdue = !tx.paidAt && tx.dueDate < d0;
                return (
                  <tr key={tx.id}>
                    <td>{formatDate(tx.paidAt ?? tx.dueDate)}</td>
                    <td>
                      <Link href={`/empresa/${slug}/lancamentos/${tx.id}`} style={{ color: "inherit" }}>
                        {tx.description}
                      </Link>
                      {tx.counterpart && <div className="small muted">{tx.counterpart}</div>}
                      {tx.recurrenceGroup && (
                        <span className="badge">
                          {tx.recurrence === "parcelada" ? "parcela" : tx.openEnded ? "fixa mensal" : "fixa"} {installmentLabel(tx) ?? ""}
                        </span>
                      )}{" "}
                      {tx.document && <span className="doc">Doc {tx.document}</span>}{" "}
                      {tx.partialOf && <span className="badge amber">pagamento parcial</span>}{" "}
                      {tx.originalAmount !== null && !tx.paidAt && <span className="badge amber">restante de {formatMoney(tx.originalAmount)}</span>}{" "}
                      {tx.transferId && <span className="badge">entre empresas</span>}{" "}
                      {tx.balanceAdjustment && <span className="badge amber">ajuste de saldo</span>}{" "}
                      {!manual && <span className="badge blue">CHServer</span>}
                    </td>
                    <td className="small">{categoryName ?? tx.externalCategory ?? ""}</td>
                    <td className="small">{accountName}</td>
                    <td>
                      {tx.paidAt && tx.paidAt > d0 ? (
                        <span className="badge amber" title="Data do pagamento no futuro: ainda não entrou no saldo">
                          Agendado · {formatDate(tx.paidAt).slice(0, 5)}
                        </span>
                      ) : tx.paidAt ? (
                        <span className="badge green">{tx.type === "entrada" ? "Recebido" : "Pago"}</span>
                      ) : (
                        <span className={`badge ${overdue ? "red" : "amber"}`}>
                          {overdue ? "Vencido" : "Pendente"} · {formatDate(tx.dueDate).slice(0, 5)}
                        </span>
                      )}
                    </td>
                    <td className={`num ${tx.type === "entrada" ? "pos" : "neg"}`}>
                      <Money value={tx.type === "entrada" ? tx.amount : -tx.amount} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {canLaunch && manual && !tx.paidAt && !tx.transferId && (
                          <SettleButton
                            item={tx}
                            accounts={accounts.filter((a) => (a.active && !a.viaCompany) || a.id === tx.accountId)}
                            today={d0}
                            label={tx.type === "entrada" ? "Receber" : "Pagar"}
                          />
                        )}
                        {canLaunch && manual && (tx.paidAt || tx.transferId) && (
                          <form action={setPaid}>
                            <input type="hidden" name="id" value={tx.id} />
                            {tx.paidAt ? (
                              <>
                                <input type="hidden" name="undo" value="1" />
                                <button className="btn sm" type="submit" title="Voltar para pendente">
                                  Estornar
                                </button>
                              </>
                            ) : (
                              <button className="btn sm" type="submit">
                                Baixar
                              </button>
                            )}
                          </form>
                        )}
                        {canLaunch && manual && !tx.transferId && !(tx.partialOf && tx.paidAt) && (
                          <DeleteButton item={{ ...tx, seriesOpen, seriesOpenFrom }} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
