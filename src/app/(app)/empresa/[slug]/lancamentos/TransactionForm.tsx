"use client";

import { useState } from "react";
import { saveTransaction } from "@/app/actions/lancamentos";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";

type Opt = { id: number; name: string };
type Cat = Opt & { type: "entrada" | "saida" };

export type TxInitial = {
  id?: number;
  type: "entrada" | "saida";
  description: string;
  amount: string;
  dueDate: string;
  paidAt: string | null;
  accountId?: number;
  categoryId?: number | null;
  counterpart: string;
  notes: string;
};

export function TransactionForm({
  companyId,
  accounts,
  categories,
  initial,
  today,
}: {
  companyId: number;
  accounts: Opt[];
  categories: Cat[];
  initial: TxInitial;
  today: string;
}) {
  const [type, setType] = useState(initial.type);
  const [paid, setPaid] = useState(initial.paidAt !== null);
  const isNew = !initial.id;
  return (
    <ActionForm action={saveTransaction} className="form card" resetOnSuccess={isNew}>
      <input type="hidden" name="companyId" value={companyId} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="tabs">
        <label className="check">
          <input type="radio" name="type" value="entrada" checked={type === "entrada"} onChange={() => setType("entrada")} /> Entrada
        </label>
        <label className="check">
          <input type="radio" name="type" value="saida" checked={type === "saida"} onChange={() => setType("saida")} /> Saída
        </label>
      </div>
      <div className="fields">
        <label style={{ gridColumn: "span 2" }}>
          Descrição
          <input name="description" defaultValue={initial.description} maxLength={200} required />
        </label>
        <label>
          Valor (R$)
          <input name="amount" defaultValue={initial.amount} inputMode="decimal" placeholder="0,00" required />
        </label>
        <label>
          Vencimento
          <input name="dueDate" type="date" defaultValue={initial.dueDate} required />
        </label>
        <label>
          Conta
          <select name="accountId" defaultValue={initial.accountId ?? accounts[0]?.id} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoria
          <select name="categoryId" defaultValue={initial.categoryId ?? ""} key={type}>
            <option value="">Sem categoria</option>
            {categories
              .filter((c) => c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          {type === "entrada" ? "Cliente" : "Fornecedor"}
          <input name="counterpart" defaultValue={initial.counterpart} maxLength={150} />
        </label>
      </div>
      <div className="fields">
        <label className="check">
          <input type="checkbox" name="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          {type === "entrada" ? "Já recebido" : "Já pago"}
        </label>
        {paid && (
          <label>
            Data do {type === "entrada" ? "recebimento" : "pagamento"}
            <input name="paidAt" type="date" defaultValue={initial.paidAt ?? today} />
          </label>
        )}
        {isNew && (
          <label>
            Repetir todo mês
            <select name="repeat" defaultValue="1">
              <option value="1">Não repetir</option>
              {[2, 3, 6, 12, 24, 36].map((n) => (
                <option key={n} value={n}>
                  {n} meses
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        Observações
        <textarea name="notes" defaultValue={initial.notes} maxLength={1000} />
      </label>
      <div>
        <Submit>{isNew ? "Salvar lançamento" : "Salvar alterações"}</Submit>
      </div>
    </ActionForm>
  );
}
