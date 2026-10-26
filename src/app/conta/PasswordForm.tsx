"use client";

import { changePassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";

export function PasswordForm() {
  return (
    <ActionForm action={changePassword} resetOnSuccess>
      <label>
        Senha atual
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        Nova senha (mínimo 10 caracteres, com letras e números)
        <input name="next" type="password" autoComplete="new-password" required minLength={10} />
      </label>
      <label>
        Confirme a nova senha
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
      </label>
      <Submit>Trocar senha</Submit>
    </ActionForm>
  );
}
