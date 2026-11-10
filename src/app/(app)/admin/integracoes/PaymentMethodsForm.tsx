"use client";

import { useActionState } from "react";
import { savePaymentMethods } from "@/app/actions/integracoes";
import { Feedback } from "@/components/FormStatus";
import { formatMoney } from "@/lib/format";

export type MethodRow = { method: string; accountId: number | null; days: number; total: number; notes: number };

/** Tabela "forma de pagamento → conta e prazo" das vendas do CH. */
export function PaymentMethodsForm({ rows, accounts, fallback }: { rows: MethodRow[]; accounts: { id: number; name: string }[]; fallback: number | null }) {
  const [state, save, saving] = useActionState(savePaymentMethods, undefined);
  return (
    <form action={save} className="form">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Forma no CH</th>
              <th className="num">Últimos 90 dias</th>
              <th>Cai na conta</th>
              <th>Em quantos dias</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.method}>
                <td>
                  <input type="hidden" name={`m_${i}`} value={r.method} />
                  {r.method}
                </td>
                <td className="num small">
                  {r.notes ? (
                    <>
                      {formatMoney(r.total)} <span className="muted">({r.notes})</span>
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <select name={`a_${i}`} defaultValue={r.accountId ?? fallback ?? ""}>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select name={`d_${i}`} defaultValue={r.days}>
                    <option value={0}>Na hora (D+0)</option>
                    <option value={1}>No dia seguinte (D+1)</option>
                    <option value={2}>D+2</option>
                    <option value={14}>D+14</option>
                    <option value={30}>D+30</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="filters">
        <button className="btn primary" type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar formas de pagamento"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
