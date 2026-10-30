import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { Mark } from "@/components/Mark";
import { MenuToggle, SidebarNav, type NavGroup } from "@/components/Sidebar";
import { getUserCompanies } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { formatMoney, today } from "@/lib/format";
import { accountBalances, pendingItems } from "@/lib/queries";
import { extendOpenEnded } from "@/lib/recurrence";
import { roleAllows } from "@/lib/roles";
import { db } from "@/db";
import { integrationSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/conta?primeiro=1");
  const companies = await getUserCompanies(user);
  const ids = companies.map((c) => c.id);
  const d0 = today();
  // Contas fixas sem fim: garante os próximos 12 meses gerados (barato quando não há nada a fazer).
  await extendOpenEnded(ids).catch((e) => console.error("Falha ao estender contas fixas:", e));
  const [balances, overdueItems, [integration]] = await Promise.all([
    accountBalances(ids),
    pendingItems(ids, d0),
    db.select({ companyId: integrationSettings.companyId, importSales: integrationSettings.importSales }).from(integrationSettings),
  ]);
  // A empresa ligada ao Integrador BI ganha o submenu Vendas.
  const salesCompanyId = integration?.importSales ? integration.companyId : null;
  const overdue = overdueItems.filter((p) => p.dueDate < d0);
  const balanceOf = (list: number[]) => balances.filter((b) => list.includes(b.companyId)).reduce((s, b) => s + b.balance, 0);
  const overdueOf = (list: number[], consolidated = false, type?: "entrada" | "saida") =>
    overdue.filter((p) => list.includes(p.companyId) && !(consolidated && p.transferId) && (!type || p.type === type)).length;
  // Menu Financeiro, igual em cada empresa e no consolidado.
  const finance = (base: string, list: number[], consolidated = false) => [
    { href: `${base}/pagar`, label: "Contas a pagar", count: overdueOf(list, consolidated, "saida"), heading: "Financeiro", sub: true },
    { href: `${base}/receber`, label: "Contas a receber", count: overdueOf(list, consolidated, "entrada"), sub: true },
    { href: `${base}/projecao`, label: "Projeção", sub: true },
    { href: `${base}/relatorios`, label: "Relatórios", sub: true },
  ];

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
        { href: "/consolidado/entre-empresas", label: "Entre empresas" },
        ...finance("/consolidado", ids, true),
      ],
    });
  }
  for (const c of companies) {
    const base = `/empresa/${c.slug}`;
    const total = balanceOf([c.id]);
    const n = overdueOf([c.id]);
    const links: NavGroup["links"] = [
      { href: base, label: "Visão geral" },
      { href: `${base}/lancamentos`, label: "Lançamentos" },
      ...(c.id === salesCompanyId ? [{ href: `${base}/vendas`, label: "Vendas" }] : []),
      ...finance(base, [c.id]),
    ];
    if (roleAllows(c.role, "gerir")) links.push({ href: `${base}/ajustes`, label: "Ajustes da empresa", heading: "Configurações", sub: true });
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
