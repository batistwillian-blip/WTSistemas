"use client";

import { login } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { PasswordInput } from "@/components/PasswordInput";

export function LoginForm() {
  return (
    <ActionForm action={login}>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label>
        Senha
        <PasswordInput name="password" autoComplete="current-password" required />
      </label>
      <Submit>Entrar</Submit>
    </ActionForm>
  );
}
