import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recoveryCodes } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";
import { RecoveryCodes } from "./RecoveryCodes";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const user = await requireUser();
  const [{ n }] = await db
    .select({ n: count() })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, user.id), isNull(recoveryCodes.usedAt)));
  return (
    <div className="login-page">
      <div className="login-card single"><div className="login-form">
        <div>
          <h1>Minha senha</h1>
          <p className="muted small">{user.email}</p>
        </div>
        {user.mustChangePassword && <div className="alert info">Por segurança, troque a senha provisória antes de continuar.</div>}
        <PasswordForm />
        {!user.mustChangePassword && (
          <>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <h2>Códigos de recuperação</h2>
              <p className="muted small">Se esquecer a senha, use um destes códigos em “Esqueci minha senha” na tela de login.</p>
            </div>
            <RecoveryCodes remaining={n} />
            <Link href="/">← Voltar</Link>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
