"use client";

import { recoverPassword } from "@/app/actions/auth";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { PasswordInput } from "@/components/PasswordInput";

export function RecoverForm() {
  return (
    <ActionForm action={recoverPassword}>
      <label>
        E-mail
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label>
        Código de recuperação
        <input name="code" placeholder="XXXX-XXXX-XXXX" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required maxLength={20} />
      </label>
      <label>
        Nova senha (mínimo 10 caracteres, com letras e números)
        <PasswordInput name="next" autoComplete="new-password" required minLength={10} />
      </label>
      <label>
        Confirme a nova senha
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={10} />
      </label>
      <Submit>Trocar senha e entrar</Submit>
    </ActionForm>
  );
}
