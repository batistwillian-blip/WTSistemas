import Link from "next/link";
import { redirect } from "next/navigation";
import { WtLogo } from "@/components/WtLogo";
import { requireUser } from "@/lib/auth";
import { userModules } from "@/lib/modules";

export const dynamic = "force-dynamic";
export const metadata = { title: "Início · WT Sistemas" };

export default async function InicioPage() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/conta?primeiro=1");
  const mods = await userModules(user);
  // Quem só tem um sistema vai direto para ele (o master sempre vê a tela, por causa de Usuários e permissões).
  if (mods.length === 1 && !user.isAdmin) redirect(mods[0].href);
  const first = user.name.split(" ")[0];
  return (
    <div className="wt">
      <div className="wt-top">
        <span>{user.name}</span>
        <Link href="/conta">Minha senha</Link>
        <form method="post" action="/sair">
          <button>Sair</button>
        </form>
      </div>
      <div className="wt-home">
        <WtLogo />
        <h1>Olá, {first}. Onde vamos trabalhar hoje?</h1>
        <div className="wt-mods">
          {mods.map((m) => (
            // <a> comum: a Central é uma página própria (fora do Next), então não usa navegação do cliente.
            <a key={m.key} href={m.href} className={`wt-mod ${m.key}`}>
              <span className="ic" aria-hidden="true">{m.icon}</span>
              <h2>{m.title}</h2>
              <p>{m.desc}</p>
              <span className="go">Entrar →</span>
            </a>
          ))}
          {user.isAdmin && (
            <Link href="/admin/usuarios" className="wt-mod admin">
              <span className="ic" aria-hidden="true">👥</span>
              <h2>Usuários e permissões</h2>
              <p>Criar usuários e escolher o que cada um pode ver e fazer.</p>
              <span className="go">Abrir →</span>
            </Link>
          )}
        </div>
        {mods.length === 0 && <p className="wt-sub">Seu usuário ainda não tem acesso a nenhum sistema. Fale com o administrador.</p>}
      </div>
    </div>
  );
}
