import { Overview } from "@/components/Overview";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { roleAllows, roleLabels } from "@/lib/roles";

export default async function EmpresaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company, role } = await requireCompany(slug);
  return (
    <>
      <PageHead
        context={company.name}
        color={company.color}
        title="Visão geral"
        action={roleAllows(role, "lancar") ? { href: `/empresa/${slug}/lancamentos/novo`, label: "+ Novo lançamento" } : undefined}
      />
      {role !== "gestor" && <p className="small muted">Seu acesso nesta empresa: {roleLabels[role]}</p>}
      <Overview companies={[company]} consolidated={false} />
    </>
  );
}
