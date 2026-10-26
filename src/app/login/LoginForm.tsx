"use client";

import { login } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";

export function LoginForm() {
  return (
    <ActionForm action={login}>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label>
        Senha
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      <Submit>Entrar</Submit>
    </ActionForm>
  );
}
