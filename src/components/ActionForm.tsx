"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/form";
import { Feedback } from "./FormStatus";
import { PendingContext } from "./pending-context";

/**
 * Formulário ligado a uma ação do servidor, mostrando erro ou sucesso.
 * Envia via onSubmit (e não pela prop action) para o React não limpar os campos quando há erro.
 */
export function ActionForm({
  action,
  children,
  className = "form",
  resetOnSuccess = false,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, run, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      <PendingContext.Provider value={pending}>
        {children}
        <Feedback state={state} />
      </PendingContext.Provider>
    </form>
  );
}
