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
  recurrence?: string | null;
  openEnded?: boolean;
};

export function TransactionForm({
  companyId,
  accounts,
  categories,
  initial,
  today,
  categoriesHref,
}: {
  companyId: number;
  accounts: Opt[];
  categories: Cat[];
  initial: TxInitial;
  today: string;
  /** Onde criar novas categorias (Ajustes da empresa), se a pessoa puder. */
  categoriesHref?: string;
}) {
  const [type, setType] = useState(initial.type);
  const [paid, setPaid] = useState(initial.paidAt !== null);
  const [mode, setMode] = useState<"unica" | "mensal" | "parcelada">("unica");
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
          <span>
            Categoria
            {categoriesHref && (
              <a href={categoriesHref} className="small" style={{ marginLeft: 8, fontWeight: 400 }}>
                criar nova
              </a>
            )}
          </span>
          <select name="categoryId" defaultValue={initial.categoryId ?? ""} key={type}>
            <option value="">Sem categoria</option>
            {categories
              .filter((c) => c.type === type)
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
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
      </div>
      {isNew && (
        <fieldset className="fields" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12 }}>
          <legend className="small" style={{ padding: "0 6px" }}>
            Esta conta é
          </legend>
          <label>
            Tipo de conta
            <select name="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="unica">Única (só esta vez)</option>
              <option value="mensal">Fixa todo mês</option>
              <option value="parcelada">Parcelada</option>
            </select>
          </label>
          {mode === "mensal" && (
            <label>
              Por quanto tempo
              <select name="months" defaultValue="sem_fim">
                <option value="sem_fim">Sem data de fim</option>
                {[3, 6, 12, 24, 36].map((n) => (
                  <option key={n} value={n}>
                    {n} meses
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "parcelada" && (
            <>
              <label>
                Número de parcelas
                <input name="installments" type="number" min={2} max={72} defaultValue={2} required />
              </label>
              <label>
                O valor informado é
                <select name="amountIs" defaultValue="total">
                  <option value="total">O total (divide nas parcelas)</option>
                  <option value="parcela">O de cada parcela</option>
                </select>
              </label>
            </>
          )}
          {mode !== "unica" && (
            <p className="help" style={{ gridColumn: "1 / -1", margin: 0 }}>
              O vencimento informado é o da primeira; as próximas vencem no mesmo dia dos meses seguintes
              {mode === "parcelada"
                ? " e ganham “(1/N)” na descrição."
                : ". Sem data de fim, o sistema mantém sempre os próximos 12 meses lançados. Para mudar o valor de um mês só, ou desse mês em diante, edite a conta."}
            </p>
          )}
        </fieldset>
      )}
      {!isNew && initial.recurrence && (
        <div className="fields">
          <label>
            Aplicar a alteração em
            <select name="scope" defaultValue="esta">
              <option value="esta">Só esta</option>
              <option value="proximas">Esta e as próximas em aberto</option>
            </select>
          </label>
        </div>
      )}
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
