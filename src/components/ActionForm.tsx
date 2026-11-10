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
  success,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  review?: (fd: FormData) => Review | null;
  /** Depois de salvar com sucesso, troca o formulário por esta tela (ex.: "Novo lançamento" / "Voltar"). */
  success?: (message: string) => React.ReactNode;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [asking, setAsking] = useState<FormData | null>(null);
  // Recalculado a cada render: o resumo pode ter campos editáveis (ex.: parcelas) ligados ao estado do formulário.
  const current = asking && review ? review(asking) : null;
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
  if (success && state?.ok) return <>{success(state.ok)}</>;
  return (
    <>
      <form
        ref={ref}
        className={className}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (review?.(fd)) setAsking(fd);
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
          {current && (
            <div className="form">
              <h2 style={{ margin: 0 }}>{current.title}</h2>
              {current.body}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" className="btn" onClick={close}>
                  Não, voltar e corrigir
                </button>
                <button
                  type="button"
                  className="btn primary"
                  autoFocus
                  onClick={() => {
                    // Lê o formulário de novo: pega os ajustes feitos no próprio resumo.
                    const fd = new FormData(ref.current!);
                    close();
                    startTransition(() => run(fd));
                  }}
                >
                  {current.confirm}
                </button>
              </div>
            </div>
          )}
        </dialog>
      )}
    </>
  );
}
