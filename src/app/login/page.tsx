import { redirect } from "next/navigation";
import { WtLogo } from "@/components/WtLogo";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar · WT Sistemas" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/inicio");
  return (
    <div className="wt">
      <div className="wt-login">
        <WtLogo />
        <div className="wt-card">
          <h2>Entrar</h2>
          <p className="wt-sub">Use o e-mail e a senha que o administrador criou para você.</p>
          <LoginForm />
        </div>
        <p className="wt-foot">Esqueceu a senha? Fale com o administrador.</p>
      </div>
    </div>
  );
}
