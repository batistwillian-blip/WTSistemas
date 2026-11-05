"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { adjustBalance } from "@/app/actions/ajustes";
import { formatMoney, parseMoney } from "@/lib/format";
import { Feedback } from "./FormStatus";

/** "Ajustar saldo": informa quanto tem de verdade na conta e o sistema lança a diferença (fora de receitas e despesas). */
export function AdjustBalanceButton({
  account,
  accounts,
  today,
  className = "btn sm",
  label = "Ajustar saldo",
}: {
  /** Uma conta só, ou uma lista para escolher no próprio formulário. */
  account?: { id: number; name: string; balance: number };
  accounts?: { id: number; name: string; balance: number }[];
  today: string;
  className?: string;
  label?: string;
}) {
  const list = accounts ?? (account ? [account] : []);
  const [selected, setSelected] = useState(list[0]?.id ?? 0);
  const ref = useRef<HTMLDialogElement>(null);
  const [state, run, pending] = useActionState(adjustBalance, undefined);
  const [real, setReal] = useState("");
  const [date, setDate] = useState(today);
  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);
  const acc = list.find((a) => a.id === selected) ?? list[0];
  const cents = parseMoney(real);
  const diff = cents === null ? null : cents - acc.balance;
  return (
    <>
      <button className={className} type="button" onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      {state?.ok && <span className="small muted"> {state.ok}</span>}
      <dialog ref={ref} className="dialog" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => run(fd));
          }}
        >
          <input type="hidden" name="accountId" value={acc.id} />
          <div>
            <h2 style={{ margin: 0 }}>Ajustar saldo{list.length === 1 ? `: ${acc.name}` : ""}</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              No sistema hoje: <b className="num">{formatMoney(acc.balance)}</b>. Informe quanto tem de verdade na conta (extrato ou caixa contado).
            </p>
          </div>
          {list.length > 1 && (
            <label>
              Conta
              <select value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
                {list.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} (no sistema: {formatMoney(a.balance)})
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="fields">
            <label>
              Saldo real (R$)
              <input name="real" inputMode="decimal" placeholder="0,00" value={real} onChange={(e) => setReal(e.target.value)} required autoFocus />
            </label>
            <label>
              Em qual data
              <input name="date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>
          <label>
            Observação (opcional)
            <input name="notes" maxLength={300} placeholder="Ex.: conferido com o extrato do Itaú" />
          </label>
          {diff !== null && date === today && (
            <p className="help" style={{ margin: 0 }}>
              {diff === 0 ? (
                "O saldo já confere; nada será lançado."
              ) : (
                <>
                  Será lançado um ajuste de <b className="num">{diff > 0 ? "+" : "−"}{formatMoney(Math.abs(diff))}</b>. Ele acerta o saldo, mas não conta como receita nem despesa
                  nos relatórios.
                </>
              )}
            </p>
          )}
          {date !== today && <p className="help" style={{ margin: 0 }}>O sistema calcula a diferença com o saldo que a conta tinha nessa data.</p>}
          <Feedback state={state?.error ? state : undefined} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Salvando…" : "Ajustar saldo"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
