"use client";

import { createTransfer } from "@/app/actions/transferencias";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { natureLabels, NATURES } from "@/lib/labels";

type Opt = { id: number; label: string; company: string };

export function TransferForm({ accounts, today }: { accounts: Opt[]; today: string }) {
  const companies = [...new Set(accounts.map((a) => a.company))];
  const options = companies.map((c) => (
    <optgroup key={c} label={c}>
      {accounts
        .filter((a) => a.company === c)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
    </optgroup>
  ));
  return (
    <ActionForm action={createTransfer} resetOnSuccess>
      <div className="fields">
        <label>
          Sai de
          <select name="fromAccountId" required defaultValue="">
            <option value="" disabled>
              Escolha a conta
            </option>
            {options}
          </select>
        </label>
        <label>
          Entra em
          <select name="toAccountId" required defaultValue="">
            <option value="" disabled>
              Escolha a conta
            </option>
            {options}
          </select>
        </label>
        <label>
          Natureza
          <select name="nature" required defaultValue="emprestimo">
            {NATURES.map((n) => (
              <option key={n} value={n}>
                {natureLabels[n]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor (R$)
          <input name="amount" inputMode="decimal" placeholder="0,00" required />
        </label>
        <label>
          Data
          <input name="date" type="date" defaultValue={today} required />
        </label>
        <label>
          Descrição
          <input name="description" maxLength={200} placeholder="Opcional" />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="pending" /> Ainda não aconteceu (fica como a pagar/receber nas duas empresas)
      </label>
      <div>
        <Submit>Registrar</Submit>
      </div>
    </ActionForm>
  );
}
