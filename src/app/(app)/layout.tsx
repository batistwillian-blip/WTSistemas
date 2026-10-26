import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Mark } from "@/components/Mark";
import { MenuToggle, SidebarNav, type NavGroup } from "@/components/Sidebar";
import { getUserCompanies } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatMoney, today } from "@/lib/format";
import { accountBalances, pendingItems } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/conta?primeiro=1");
  const companies = await getUserCompanies(user);
  const ids = companies.map((c) => c.id);
  const d0 = today();
  const [balances, overdueItems] = await Promise.all([accountBalances(ids), pendingItems(ids, d0)]);
  const overdue = overdueItems.filter((p) => p.dueDate < d0);
  const balanceOf = (list: number[]) => balances.filter((b) => list.includes(b.companyId)).reduce((s, b) => s + b.balance, 0);
  const overdueOf = (list: number[], consolidated = false) =>
    overdue.filter((p) => list.includes(p.companyId) && !(consolidated && p.transferId)).length;

  const groups: NavGroup[] = [];
  if (companies.length > 1) {
    const total = balanceOf(ids);
    const n = overdueOf(ids, true);
    groups.push({
      key: "consolidado",
      title: "Consolidado",
      color: "#9CBAE5",
      href: "/consolidado",
      balance: formatMoney(total),
      negative: total < 0,
      overdue: n,
      links: [
        { href: "/consolidado", label: "Visão geral" },
        { href: "/consolidado/contas", label: "A pagar e receber", count: n },
        { href: "/consolidado/projecao", label: "Projeção" },
        { href: "/consolidado/entre-empresas", label: "Entre empresas" },
      ],
    });
  }
  for (const c of companies) {
    const base = `/empresa/${c.slug}`;
    const total = balanceOf([c.id]);
    const n = overdueOf([c.id]);
    const links = [
      { href: base, label: "Visão geral" },
      { href: `${base}/lancamentos`, label: "Lançamentos" },
      { href: `${base}/contas`, label: "A pagar e receber", count: n },
      { href: `${base}/projecao`, label: "Projeção" },
    ];
    if (roleAllows(c.role, "gerir")) links.push({ href: `${base}/ajustes`, label: "Ajustes da empresa" });
    groups.push({
      key: c.slug,
      title: c.name,
      color: c.color,
      href: base,
      balance: formatMoney(total),
      negative: total < 0,
      overdue: n,
      links,
      section: "Empresas",
    });
  }
  if (user.isAdmin) {
    groups.push({
      key: "admin",
      title: "Administração",
      href: "/admin/usuarios",
      links: [
        { href: "/admin/usuarios", label: "Usuários e acessos" },
        { href: "/admin/integracoes", label: "Integrador BI (CHServer)" },
        { href: "/admin/log", label: "Log de alterações" },
      ],
      section: "Sistema",
    });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <Mark />
          <div>
            <b>Caixa Consolidado</b>
            <small>
              {companies.length} {companies.length === 1 ? "empresa" : "empresas"}
            </small>
          </div>
          <MenuToggle />
        </div>
        <SidebarNav groups={groups} />
        <div className="side-foot">
          <div className="who">
            <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{user.name}</b>
              <small>{user.isAdmin ? "Administrador" : "Usuário"}</small>
            </div>
          </div>
          <Link href="/conta">Trocar minha senha</Link>
          <form action={logout}>
            <button type="submit">Sair</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
