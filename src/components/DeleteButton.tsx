"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { removeTransaction } from "@/app/actions/lancamentos";
import { installmentLabel } from "@/lib/billing";
import { formatDate, formatMoney } from "@/lib/format";
import { Feedback } from "./FormStatus";

export type DeleteItem = {
  id: number;
  type: "entrada" | "saida";
  amount: number;
  description: string;
  dueDate: string;
  paidAt: string | null;
  counterpart: string | null;
  document: string | null;
  installment: number | null;
  installments: number | null;
  /** Pagamento parcial já registrado (excluir = estornar). */
  partialOf?: number | null;
  recurrenceGroup?: string | null;
  openEnded?: boolean;
  /** Contas em aberto na série inteira e desta em diante (inclui esta, se estiver em aberto). */
  seriesOpen?: number;
  seriesOpenFrom?: number;
};

/**
 * Botão "Excluir" com confirmação: mostra a conta e, se ela faz parte de uma série,
 * deixa escolher só esta, esta e as próximas em aberto, ou todas as em aberto.
 */
export function DeleteButton({ item, className = "btn sm danger", redirectTo }: { item: DeleteItem; className?: string; redirectTo?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, run, pending] = useActionState(removeTransaction, undefined);
  const [scope, setScope] = useState<"esta" | "futuras" | "todas">("esta");
  const entrada = item.type === "entrada";
  const partial = Boolean(item.partialOf && item.paidAt);
  const parcel = installmentLabel(item);
  const open = item.paidAt ? 0 : 1;
  // Outras contas em aberto da série além desta: desta em diante e no total.
  const fromHere = item.recurrenceGroup ? Math.max((item.seriesOpenFrom ?? 0) - open, 0) + 1 : 1;
  const all = item.recurrenceGroup ? Math.max((item.seriesOpen ?? 0) - open, 0) + 1 : 1;
  const count = scope === "todas" ? all : scope === "futuras" ? fromHere : 1;

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  return (
    <>
      <button className={className} type="button" onClick={() => ref.current?.showModal()} title={partial ? "Estornar este pagamento parcial" : "Excluir esta conta"}>
        {partial ? "Estornar" : "Excluir"}
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
          <input type="hidden" name="scope" value={scope} />
          {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
          <div>
            <h2 style={{ margin: 0 }}>{partial ? "Estornar pagamento parcial?" : `Excluir conta a ${entrada ? "receber" : "pagar"}?`}</h2>
            <p style={{ margin: "6px 0 0" }}>
              <b>{item.description}</b>
              {parcel && (
                <span className="badge" style={{ marginLeft: 6 }}>
                  parcela {parcel}
                </span>
              )}
            </p>
            <p className="muted small" style={{ margin: "2px 0 0" }}>
              {item.document && <>Doc {item.document} · </>}
              {item.counterpart && <>{item.counterpart} · </>}
              vence {formatDate(item.dueDate)} · <b className="num">{formatMoney(item.amount)}</b>
              {item.paidAt && <> · {entrada ? "recebida" : "paga"} em {formatDate(item.paidAt)}</>}
            </p>
          </div>

          {partial ? (
            <p className="help" style={{ margin: 0 }}>
              O valor volta a ficar em aberto na conta original.
            </p>
          ) : (
            <>
              {item.recurrenceGroup && (fromHere > 1 || all > 1) && (
                <fieldset className="repeat" style={{ gap: 8 }}>
                  <legend>O que excluir</legend>
                  <label className="check">
                    <input type="radio" name="_scope" checked={scope === "esta"} onChange={() => setScope("esta")} /> Só esta{parcel ? ` parcela (${parcel})` : ""}
                  </label>
                  {fromHere > 1 && (
                    <label className="check">
                      <input type="radio" name="_scope" checked={scope === "futuras"} onChange={() => setScope("futuras")} /> Esta e as próximas em aberto ({fromHere})
                    </label>
                  )}
                  {all > fromHere && (
                    <label className="check">
                      <input type="radio" name="_scope" checked={scope === "todas"} onChange={() => setScope("todas")} /> Todas as em aberto desta série ({all})
                    </label>
                  )}
                  <span className="small muted">Parcelas já {entrada ? "recebidas" : "pagas"} não são excluídas.</span>
                </fieldset>
              )}
              {item.paidAt && scope === "esta" && (
                <div className="alert error" style={{ margin: 0 }}>
                  Esta conta já está {entrada ? "recebida" : "paga"}: ao excluir, o valor sai do saldo da conta. Se só a baixa foi errada, use Estornar.
                </div>
              )}
              {item.openEnded && scope !== "esta" && (
                <p className="help" style={{ margin: 0 }}>
                  É uma conta fixa sem data de fim: o sistema para de gerar os próximos meses.
                </p>
              )}
              <p className="help" style={{ margin: 0 }}>
                {count === 1 ? "A conta sai" : `As ${count} contas saem`} das listas e dos totais. A exclusão fica registrada no histórico, com seu nome e a data.
              </p>
            </>
          )}
          <Feedback state={state?.error ? state : undefined} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => ref.current?.close()}>
              Não, voltar
            </button>
            <button type="submit" className="btn danger-solid" disabled={pending}>
              {pending ? "Excluindo…" : partial ? "Sim, estornar" : count === 1 ? "Sim, excluir" : `Sim, excluir ${count}`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
