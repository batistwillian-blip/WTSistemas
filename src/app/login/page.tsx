import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="login-page">
      <div className="card login-card stack">
        <div>
          <h1>Caixa consolidado</h1>
          <p className="muted small">Primetech Loja · Aura Educa · PrimeTech Sistemas</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
