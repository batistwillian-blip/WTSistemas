import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { today } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";
import { peekDocument } from "@/lib/documents";
import { getAccounts, getCategories } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { TransactionForm } from "../TransactionForm";

export default async function NovoLancamentoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const tipo = param(await searchParams, "tipo");
  const { company, role } = await requireCompany(slug, "lancar");
  const [accounts, categories, nextDoc] = await Promise.all([getAccounts([company.id], true), getCategories(company.id), peekDocument(company.id)]);
  const d0 = today();
  return (
    <div className="stack">
      <PageHead context={company.name} color={company.color} title="Novo lançamento" subtitle={<Link href={`/empresa/${slug}/lancamentos`}>← Voltar para lançamentos</Link>} />
      <TransactionForm
        companyId={company.id}
        accounts={accounts}
        categories={categories.filter((c) => c.active)}
        today={d0}
        nextDocument={nextDoc}
        categoriesHref={roleAllows(role, "gerir") ? `/empresa/${slug}/ajustes` : undefined}
        initial={{ type: tipo === "entrada" ? "entrada" : "saida", description: "", amount: "", dueDate: d0, paidAt: null, counterpart: "", notes: "" }}
      />
      <p className="small muted">Para dinheiro que vai de uma empresa para outra, use Entre empresas no Consolidado.</p>
    </div>
  );
}
