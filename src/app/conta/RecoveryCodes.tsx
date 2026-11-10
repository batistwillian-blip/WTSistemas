"use client";

import { startTransition, useActionState } from "react";
import { generateRecoveryCodes } from "@/app/actions/auth";
import { Feedback } from "@/components/FormStatus";
import { PasswordInput } from "@/components/PasswordInput";

/** Gera os códigos de recuperação e mostra uma única vez. */
export function RecoveryCodes({ remaining }: { remaining: number }) {
  const [state, run, pending] = useActionState(generateRecoveryCodes, undefined);
  if (state?.codes) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        <div className="alert ok">{state.ok}</div>
        <div className="codes">
          {state.codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="filters">
          <button className="btn sm" type="button" onClick={() => navigator.clipboard?.writeText(state.codes!.join("\n"))}>
            Copiar
          </button>
          <button className="btn sm" type="button" onClick={() => window.print()}>
            Imprimir
          </button>
        </div>
      </div>
    );
  }
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => run(fd));
      }}
    >
      <p className="small muted">
        {remaining > 0
          ? `Você tem ${remaining} ${remaining === 1 ? "código" : "códigos"} sem usar. Gerar novos cancela os antigos.`
          : "Você ainda não tem códigos. Gere e guarde num lugar seguro (impresso ou no gerenciador de senhas)."}
      </p>
      <label>
        Confirme com a sua senha atual
        <PasswordInput name="current" autoComplete="current-password" required />
      </label>
      <div>
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Gerando…" : remaining > 0 ? "Gerar novos códigos" : "Gerar códigos de recuperação"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
