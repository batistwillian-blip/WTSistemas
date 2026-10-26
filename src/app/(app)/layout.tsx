import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { SidebarNav } from "@/components/Sidebar";
import { getUserCompanies } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { roleAllows } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/conta?primeiro=1");
  const companies = await getUserCompanies(user);

  const groups = [];
  if (companies.length > 1) {
    groups.push({
      title: "Consolidado",
      links: [
        { href: "/consolidado", label: "Visão geral" },
        { href: "/consolidado/contas", label: "A pagar e receber" },
        { href: "/consolidado/projecao", label: "Projeção" },
        { href: "/consolidado/entre-empresas", label: "Entre empresas" },
      ],
    });
  }
  for (const c of companies) {
    const base = `/empresa/${c.slug}`;
    const links = [
      { href: base, label: "Visão geral" },
      { href: `${base}/lancamentos`, label: "Lançamentos" },
      { href: `${base}/contas`, label: "A pagar e receber" },
      { href: `${base}/projecao`, label: "Projeção" },
    ];
    if (roleAllows(c.role, "gerir")) links.push({ href: `${base}/ajustes`, label: "Ajustes" });
    groups.push({ title: c.name, color: c.color, links });
  }
  if (user.isAdmin) {
    groups.push({
      title: "Administração",
      links: [
        { href: "/admin/usuarios", label: "Usuários e acessos" },
        { href: "/admin/log", label: "Log de alterações" },
        { href: "/admin/integracoes", label: "Integrações" },
      ],
    });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">Caixa consolidado</div>
        <SidebarNav groups={groups} />
        <div className="bottom">
          <div style={{ padding: "0 10px 6px" }}>{user.name}</div>
          <Link href="/conta" style={{ color: "inherit", padding: "6px 10px", display: "block" }}>
            Minha senha
          </Link>
          <form action={logout}>
            <button type="submit">Sair</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
