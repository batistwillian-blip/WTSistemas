"use client";

import { useState } from "react";

/** Campo de senha com o "olhinho" para mostrar ou esconder o que foi digitado. */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input {...props} type={show ? "text" : "password"} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button
        type="button"
        className="pw-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Esconder senha" : "Mostrar senha"}
        title={show ? "Esconder senha" : "Mostrar senha"}
        aria-pressed={show}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
          <circle cx="12" cy="12" r="3" />
          {show && <path d="M3 3l18 18" />}
        </svg>
      </button>
    </span>
  );
}
