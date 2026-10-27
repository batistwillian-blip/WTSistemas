import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RecoverForm } from "./RecoverForm";

export const dynamic = "force-dynamic";

export default async function RecuperarPage() {
  if (await getCurrentUser()) redirect("/conta");
  return (
    <div className="login-page">
      <div className="login-card single">
        <div className="login-form">
          <div>
            <h1>Esqueci minha senha</h1>
            <p className="muted small">
              Use um dos códigos de recuperação que você gerou em Minha senha. Cada código vale uma vez. Sem códigos, peça a um administrador para trocar a
              sua senha em Usuários e acessos.
            </p>
          </div>
          <RecoverForm />
          <Link href="/login" className="small">
            ← Voltar para o login
          </Link>
        </div>
      </div>
    </div>
  );
}
