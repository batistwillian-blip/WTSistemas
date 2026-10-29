"use client";

import { useState } from "react";
import { saveTransaction } from "@/app/actions/lancamentos";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { planSeries, installmentLabel } from "@/lib/billing";
import { formatDate, formatMoney, parseMoney } from "@/lib/format";

type Opt = { id: number; name: string };
type Cat = Opt & { type: "entrada" | "saida" };
type Mode = "unica" | "mensal" | "parcelada";

export type TxInitial = {
  id?: number;
  type: "entrada" | "saida";
  description: string;
  amount: string;
  dueDate: string;
  competence?: string | null;
  paidAt: string | null;
  accountId?: number;
  categoryId?: number | null;
  counterpart: string;
  notes: string;
  document?: string | null;
  recurrence?: string | null;
  openEnded?: boolean;
  installment?: number | null;
  installments?: number | null;
};

export function TransactionForm({
  companyId,
  accounts,
  categories,
  initial,
  today,
  categoriesHref,
  nextDocument,
}: {
  companyId: number;
  accounts: Opt[];
  categories: Cat[];
  initial: TxInitial;
  today: string;
  /** Onde criar novas categorias (Ajustes da empresa), se a pessoa puder. */
  categoriesHref?: string;
  /** Próximo nº automático, só para mostrar (o definitivo é dado ao salvar). */
  nextDocument?: string;
}) {
  const isNew = !initial.id;
  const [type, setType] = useState(initial.type);
  const [mode, setMode] = useState<Mode>("unica");
  const [amount, setAmount] = useState(initial.amount);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [months, setMonths] = useState("12");
  const [openEnded, setOpenEnded] = useState(false);
  const [parts, setParts] = useState("3");
  const [amountIs, setAmountIs] = useState<"total" | "parcela">("total");
  const entrada = type === "entrada";

  // Prévia do que será criado, para não ter surpresa ao salvar.
  const cents = parseMoney(amount) ?? 0;
  const count = mode === "mensal" ? (openEnded ? 12 : Number(months) || 0) : mode === "parcelada" ? Number(parts) || 0 : 1;
  const preview =
    mode !== "unica" && cents > 0 && count >= 2 && dueDate
      ? planSeries({ mode, amount: cents, dueDate, competence: dueDate.slice(0, 8) + "01", count, amountIsTotal: amountIs === "total", openEnded })
      : null;

  return (
    <ActionForm action={saveTransaction} className="form card" resetOnSuccess={isNew}>
      <input type="hidden" name="companyId" value={companyId} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="tabs">
        <label className="check">
          <input type="radio" name="type" value="entrada" checked={entrada} onChange={() => setType("entrada")} /> Entrada (a receber)
        </label>
        <label className="check">
          <input type="radio" name="type" value="saida" checked={!entrada} onChange={() => setType("saida")} /> Saída (a pagar)
        </label>
      </div>
      <div className="fields">
        <label style={{ gridColumn: "span 2" }}>
          Descrição
          <input name="description" defaultValue={initial.description} maxLength={200} required />
        </label>
        <label>
          Nº do documento
          <input name="document" defaultValue={initial.document ?? ""} maxLength={60} placeholder={nextDocument ? `Automático: ${nextDocument}` : "Automático"} />
        </label>
        <label>
          {mode === "parcelada" && amountIs === "total" ? "Valor total (R$)" : mode === "parcelada" ? "Valor da parcela (R$)" : "Valor (R$)"}
          <input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" required />
        </label>
        <label>
          {mode === "unica" ? "Vencimento" : "1º vencimento"}
          <input name="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </label>
        <label>
          Mês de competência
          <input name="competence" type="month" defaultValue={(initial.competence ?? "").slice(0, 7)} key={isNew ? dueDate.slice(0, 7) : undefined} />
          <span className="small muted" style={{ fontWeight: 400 }}>
            Em branco = mês do vencimento
          </span>
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
          {entrada ? "Cliente" : "Fornecedor"}
          <input name="counterpart" defaultValue={initial.counterpart} maxLength={150} />
        </label>
        <label>
          Data de {entrada ? "recebimento" : "pagamento"}
          <input name="paidAt" type="date" defaultValue={initial.paidAt ?? ""} />
          <span className="small muted" style={{ fontWeight: 400 }}>
            Em branco = ainda em aberto
          </span>
        </label>
      </div>

      {isNew && (
        <fieldset className="repeat">
          <legend>Repetir ou parcelar</legend>
          <input type="hidden" name="mode" value={mode} />
          <div className="tabs">
            {(
              [
                ["unica", "Lançamento único"],
                ["mensal", "Fixa todo mês"],
                ["parcelada", "Parcelado"],
              ] as const
            ).map(([v, l]) => (
              <label key={v} className="check">
                <input type="radio" name="_mode" checked={mode === v} onChange={() => setMode(v)} /> {l}
              </label>
            ))}
          </div>
          {mode === "mensal" && (
            <div className="fields">
              <label>
                Quantos meses
                <input name="months" type="number" min={2} max={60} value={openEnded ? "" : months} disabled={openEnded} onChange={(e) => setMonths(e.target.value)} />
              </label>
              <label className="check" style={{ alignSelf: "end" }}>
                <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
                Sem data de fim (o sistema mantém sempre 12 meses à frente)
              </label>
              {openEnded && <input type="hidden" name="months" value="sem_fim" />}
            </div>
          )}
          {mode === "parcelada" && (
            <div className="fields">
              <label>
                Nº de parcelas
                <input name="installments" type="number" min={2} max={72} value={parts} onChange={(e) => setParts(e.target.value)} required />
              </label>
              <label>
                O valor informado é
                <select name="amountIs" value={amountIs} onChange={(e) => setAmountIs(e.target.value as "total" | "parcela")}>
                  <option value="total">O total (divide nas parcelas)</option>
                  <option value="parcela">O de cada parcela</option>
                </select>
              </label>
            </div>
          )}
          {mode !== "unica" && (
            <p className="help" style={{ margin: 0 }}>
              {preview ? (
                <>
                  Serão criadas <b>{preview.length}</b> contas
                  {mode === "parcelada" ? (
                    <>
                      {" "}
                      ({installmentLabel(preview[0])} a {installmentLabel(preview[preview.length - 1])}) de <b className="num">{formatMoney(preview[preview.length - 1].amount)}</b>
                      {preview[0].amount !== preview[preview.length - 1].amount && <> (a 1ª de {formatMoney(preview[0].amount)})</>}
                    </>
                  ) : (
                    <>
                      {" "}
                      de <b className="num">{formatMoney(cents)}</b>
                    </>
                  )}
                  , de {formatDate(preview[0].dueDate)} a {formatDate(preview[preview.length - 1].dueDate)}
                  {openEnded ? ", e o sistema segue criando os próximos meses sozinho." : "."} Todas com o mesmo nº de documento.
                </>
              ) : (
                "Informe o valor e o 1º vencimento para ver as parcelas."
              )}
            </p>
          )}
        </fieldset>
      )}
      {!isNew && initial.recurrence && (
        <div className="fields">
          <label>
            Aplicar a alteração em
            <select name="scope" defaultValue="esta">
              <option value="esta">Só esta{initial.installment ? ` (${installmentLabel({ installment: initial.installment, installments: initial.installments ?? null })})` : ""}</option>
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
