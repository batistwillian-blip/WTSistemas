import Link from "next/link";
import { Overview } from "@/components/Overview";
import { requireCompany } from "@/lib/access";
import { roleAllows, roleLabels } from "@/lib/roles";

export default async function EmpresaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company, role } = await requireCompany(slug);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{company.name}</h1>
          <p className="muted small">Seu acesso: {roleLabels[role]}</p>
        </div>
        {roleAllows(role, "lancar") && (
          <Link className="btn primary" href={`/empresa/${slug}/lancamentos/novo`}>
            + Novo lançamento
          </Link>
        )}
      </div>
      <Overview companies={[company]} consolidated={false} />
    </>
  );
}
