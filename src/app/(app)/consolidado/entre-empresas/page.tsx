import { deleteTransfer } from "@/app/actions/transferencias";
import { PageHead } from "@/components/PageHead";
import { ConfirmButton } from "@/components/FormStatus";
import { Money } from "@/components/Money";
import { intercompanyDebts } from "@/lib/finance";
import { formatDate, today } from "@/lib/format";
import { natureLabels } from "@/lib/labels";
import { consolidatedContext } from "@/lib/page";
import { allCompanies, getAccounts, listTransfers } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { TransferForm } from "./TransferForm";

export default async function EntreEmpresasPage() {
  const { companies } = await consolidatedContext();
  const ids = companies.map((c) => c.id);
  const [transfers, accounts, everyCompany] = await Promise.all([listTransfers(ids), getAccounts(ids, true), allCompanies()]);
  const names = new Map(everyCompany.map((c) => [c.id, c.name]));
  const roles = new Map(companies.map((c) => [c.id, c.role]));
  const debts = intercompanyDebts(transfers);
  const canLaunch = companies.filter((c) => roleAllows(c.role, "lancar")).map((c) => c.id);
  const accountOptions = accounts
    .filter((a) => canLaunch.includes(a.companyId))
    .map((a) => ({ id: a.id, label: a.name, company: names.get(a.companyId) ?? "" }));

  return (
    <div className="stack">
      <PageHead context="Consolidado" title="Dinheiro entre empresas" subtitle="Empréstimos, devoluções e aportes entre as empresas. No consolidado eles se anulam." />

      <div className="card">
        <h2>Quem deve a quem</h2>
        {debts.length === 0 ? (
          <p className="muted">Nenhum empréstimo em aberto entre as empresas.</p>
        ) : (
          <table>
            <tbody>
              {debts.map((d) => (
                <tr key={`${d.debtorId}-${d.creditorId}`}>
                  <td>
                    <strong>{names.get(d.debtorId)}</strong> deve para <strong>{names.get(d.creditorId)}</strong>
                  </td>
                  <td className="num">
                    <Money value={d.amount} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {accountOptions.length > 0 && (
        <details className="box">
          <summary>Nova transferência</summary>
          <div style={{ marginTop: 12 }}>
            <TransferForm accounts={accountOptions} today={today()} />
          </div>
        </details>
      )}

      <div className="card">
        <h2>Histórico</h2>
        {transfers.length === 0 ? (
          <p className="muted">Nenhuma transferência registrada.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Natureza</th>
                  <th>De → Para</th>
                  <th>Descrição</th>
                  <th className="num">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const canDelete = roleAllows(roles.get(t.fromCompanyId), "gerir") && roleAllows(roles.get(t.toCompanyId), "gerir");
                  return (
                    <tr key={t.id}>
                      <td>{formatDate(t.date)}</td>
                      <td>
                        <span className="badge">{natureLabels[t.nature]}</span>
                      </td>
                      <td>
                        {names.get(t.fromCompanyId)} → {names.get(t.toCompanyId)}
                      </td>
                      <td>{t.description}</td>
                      <td className="num">
                        <Money value={t.amount} />
                      </td>
                      <td>
                        {canDelete && (
                          <form action={deleteTransfer} className="row-actions">
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmButton message="Excluir esta transferência? Os lançamentos nas duas empresas também serão excluídos.">
                              Excluir
                            </ConfirmButton>
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
    </div>
  );
}
