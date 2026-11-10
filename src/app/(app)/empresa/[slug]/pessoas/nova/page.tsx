import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { param, type SearchParams } from "@/lib/page";
import { PersonForm } from "../PersonForm";

export default async function NovaPessoaPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const tipo = param(await searchParams, "tipo");
  const { company } = await requireCompany(slug, "lancar");
  return (
    <div className="stack">
      <PageHead context={company.name} color={company.color} title="Novo cadastro" subtitle={<Link href={`/empresa/${slug}/pessoas`}>← Voltar para clientes e fornecedores</Link>} />
      <PersonForm
        companyId={company.id}
        initial={{ kind: tipo === "cliente" ? "cliente" : "fornecedor", name: "", taxId: "", phone: "", email: "", pix: "", address: "", notes: "" }}
      />
    </div>
  );
}
