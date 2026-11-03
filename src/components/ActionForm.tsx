"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { ActionState } from "@/lib/form";
import { Feedback } from "./FormStatus";
import { PendingContext } from "./pending-context";

/** Resumo mostrado antes de enviar: "Deseja lançar…? Sim / Não". */
export type Review = { title: string; body: React.ReactNode; confirm: string };

/**
 * Formulário ligado a uma ação do servidor, mostrando erro ou sucesso.
 * Envia via onSubmit (e não pela prop action) para o React não limpar os campos quando há erro.
 * Com `review`, mostra antes um resumo do que será salvo e só envia depois do "Sim".
 */
export function ActionForm({
  action,
  children,
  className = "form",
  resetOnSuccess = false,
  review,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  review?: (fd: FormData) => Review | null;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [asking, setAsking] = useState<{ fd: FormData; review: Review } | null>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  useEffect(() => {
    if (asking) dialog.current?.showModal();
  }, [asking]);
  const close = () => {
    dialog.current?.close();
    setAsking(null);
  };
  return (
    <>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const r = review?.(fd);
          if (r) setAsking({ fd, review: r });
          else startTransition(() => run(fd));
        }}
      >
        <PendingContext.Provider value={pending}>
          {children}
          <Feedback state={state} />
        </PendingContext.Provider>
      </form>
      {review && (
        <dialog ref={dialog} className="dialog review" onClose={() => setAsking(null)} onClick={(e) => e.target === dialog.current && close()}>
          {asking && (
            <div className="form">
              <h2 style={{ margin: 0 }}>{asking.review.title}</h2>
              {asking.review.body}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={close}>
                  Não, voltar e corrigir
                </button>
                <button
                  type="button"
                  className="btn primary"
                  autoFocus
                  onClick={() => {
                    const fd = asking.fd;
                    close();
                    startTransition(() => run(fd));
                  }}
                >
                  {asking.review.confirm}
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}
    </>
  );
}
