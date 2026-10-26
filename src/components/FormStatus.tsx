"use client";

import { useContext } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/form";
import { PendingContext } from "./pending-context";

export function Submit({ children, className = "btn primary" }: { children: React.ReactNode; className?: string }) {
  const ctx = useContext(PendingContext);
  const { pending: formPending } = useFormStatus();
  const pending = ctx ?? formPending;
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Salvando…" : children}
    </button>
  );
}

export function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <div className="alert error">{state.error}</div>;
  if (state.ok) return <div className="alert ok">{state.ok}</div>;
  return null;
}

/** Botão que pede confirmação antes de enviar o formulário. */
export function ConfirmButton({ message, children, className = "btn sm danger" }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
