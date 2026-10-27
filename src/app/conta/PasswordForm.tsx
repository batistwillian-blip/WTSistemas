"use client";

import { changePassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { PasswordInput } from "@/components/PasswordInput";

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} resetOnSuccess>
      <label>
        Senha atual
        <PasswordInput name="current" autoComplete="current-password" required />
      </label>
      <label>
        Nova senha (mínimo 10 caracteres, com letras e números)
        <PasswordInput name="next" autoComplete="new-password" required minLength={10} />
      </label>
      <label>
        Confirme a nova senha
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={10} />
      </label>
      <Submit>Trocar senha</Submit>
    </ActionForm>
  );
}
