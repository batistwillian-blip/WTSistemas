import { Overview } from "@/components/Overview";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { param, type SearchParams } from "@/lib/page";
import { roleAllows, roleLabels } from "@/lib/roles";

export default async function EmpresaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { user, company, role } = await requireCompany(slug);
  return (
    <Overview
      companies={[company]}
      consolidated={false}
      month={param(sp, "mes")}
      userName={user.name}
      head={
        <>
          <PageHead
            context={company.name}
            color={company.color}
            title="Visão geral"
            action={roleAllows(role, "lancar") ? { href: `/empresa/${slug}/lancamentos/novo`, label: "+ Novo lançamento" } : undefined}
          />
          {role !== "gestor" && <p className="small muted">Seu acesso nesta empresa: {roleLabels[role]}</p>}
        </>
      }
    />
  );
}
