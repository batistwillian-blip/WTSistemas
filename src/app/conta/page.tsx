import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const user = await requireUser();
  return (
    <div className="login-page">
      <div className="card login-card stack">
        <div>
          <h1>Minha senha</h1>
          <p className="muted small">{user.email}</p>
        </div>
        {user.mustChangePassword && <div className="alert info">Por segurança, troque a senha provisória antes de continuar.</div>}
        <PasswordForm />
        {!user.mustChangePassword && <Link href="/">← Voltar</Link>}
      </div>
    </div>
  );
}
