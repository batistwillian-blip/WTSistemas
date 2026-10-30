"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { settleTransaction } from "@/app/actions/lancamentos";
import { installmentLabel } from "@/lib/billing";
import { formatDate, formatMoney, parseMoney } from "@/lib/format";
import { Feedback } from "./FormStatus";

export type SettleItem = {
  id: number;
  type: "entrada" | "saida";
  amount: number;
  description: string;
  accountId: number;
  dueDate: string;
  installment: number | null;
  installments: number | null;
  document: string | null;
};

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Botão "Pagar"/"Receber" que abre a baixa: data, valor pago, juros, desconto, conta e pagamento parcial. */
export function SettleButton({
  item,
  accounts,
  today,
  label,
  className = "btn sm",
}: {
  item: SettleItem;
  accounts: { id: number; name: string }[];
  today: string;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, run, pending] = useActionState(settleTransaction, undefined);
  const [interest, setInterest] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState(toInput(item.amount));
  const [touched, setTouched] = useState(false);
  const entrada = item.type === "entrada";

  // Juros e desconto recalculam o valor pago até a pessoa digitar o valor à mão.
  useEffect(() => {
    if (!touched) setPaid(toInput(item.amount + (parseMoney(interest) ?? 0) - (parseMoney(discount) ?? 0)));
  }, [interest, discount, touched, item.amount]);

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  const paidCents = parseMoney(paid) ?? 0;
  const principal = paidCents - (parseMoney(interest) ?? 0) + (parseMoney(discount) ?? 0);
  const short = paidCents > 0 && principal < item.amount;

  return (
    <>
      <button className={className} type="button" onClick={() => ref.current?.showModal()}>
        {label ?? (entrada ? "Receber" : "Pagar")}
      </button>
      <dialog ref={ref} className="dialog" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => run(fd));
          }}
        >
          <input type="hidden" name="id" value={item.id} />
          <div>
            <h2 style={{ margin: 0 }}>{entrada ? "Receber" : "Pagar"} conta</h2>
            <p style={{ margin: "6px 0 0" }}>
              <b>{item.description}</b>
              {installmentLabel(item) && (
                <span className="badge" style={{ marginLeft: 6 }}>
                  parcela {installmentLabel(item)}
                </span>
              )}
            </p>
            <p className="muted small" style={{ margin: "2px 0 0" }}>
              {item.document && <>Doc {item.document} · </>}
              vence {formatDate(item.dueDate)} · em aberto <b className="num">{formatMoney(item.amount)}</b>
            </p>
          </div>
          <div className="fields">
            <label>
              Data do {entrada ? "recebimento" : "pagamento"}
              <input name="paidAt" type="date" defaultValue={today} required />
            </label>
            <label>
              {entrada ? "Entrou na conta" : "Saiu da conta"}
              <select name="accountId" defaultValue={item.accountId} required>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Juros / multa (R$)
              <input name="interest" inputMode="decimal" placeholder="0,00" value={interest} onChange={(e) => setInterest(e.target.value)} />
            </label>
            <label>
              Desconto (R$)
              <input name="discount" inputMode="decimal" placeholder="0,00" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            <label>
              Valor {entrada ? "recebido" : "pago"} (R$)
              <input
                name="paid"
                inputMode="decimal"
                value={paid}
                onChange={(e) => {
                  setTouched(true);
                  setPaid(e.target.value);
                }}
                required
              />
            </label>
          </div>
          {short && (
            <label className="check">
              <input type="checkbox" name="partial" defaultChecked />
              {entrada ? "Recebimento" : "Pagamento"} parcial: ficam em aberto <b className="num">{formatMoney(item.amount - Math.max(principal, 0))}</b>
            </label>
          )}
          <Feedback state={state?.error ? state : undefined} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Salvando…" : `Confirmar ${entrada ? "recebimento" : "pagamento"}`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
