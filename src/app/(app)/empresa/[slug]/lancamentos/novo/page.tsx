import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { today } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";
import { peekDocument } from "@/lib/documents";
import { getAccounts, getCategories, getPeople } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { TransactionForm } from "../TransactionForm";
import { personalFormOptions } from "@/lib/withdrawals";

export default async function NovoLancamentoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const tipo = param(sp, "tipo");
  const { user, company, role } = await requireCompany(slug, "lancar");
  const [accounts, categories, nextDoc, people] = await Promise.all([
    getAccounts([company.id], true),
    getCategories(company.id),
    peekDocument(company.id),
    getPeople(company.id),
  ]);
  const personal = await personalFormOptions(user, company);
  const d0 = today();
  // Pessoal: "+ Retirada da empresa" já abre como renda vinda de uma empresa, na categoria de retirada.
  const withdrawal = Boolean(personal && tipo === "entrada" && param(sp, "retirada") === "1");
  const withdrawalCategory = withdrawal ? categories.find((c) => c.type === "entrada" && c.active && /retirada/i.test(c.name)) : undefined;
  return (
    <div className="stack">
      <PageHead context={company.name} color={company.color} title={company.ownerId ? (withdrawal ? "Retirada da empresa" : tipo === "entrada" ? "Nova renda" : "Novo gasto") : "Novo lançamento"} subtitle={<Link href={`/empresa/${slug}/lancamentos`}>← Voltar para lançamentos</Link>} />
      <TransactionForm
        companyId={company.id}
        accounts={accounts}
        categories={categories.filter((c) => c.active)}
        today={d0}
        nextDocument={nextDoc}
        companyHref={`/empresa/${slug}`}
        personal={personal}
        people={people}
        peopleHref={`/empresa/${slug}/pessoas/nova?tipo=${tipo === "entrada" ? "cliente" : "fornecedor"}`}
        categoriesHref={roleAllows(role, "gerir") ? `/empresa/${slug}/ajustes` : undefined}
        initial={{
          type: tipo === "entrada" ? "entrada" : "saida",
          description: withdrawal ? "Retirada" : "",
          amount: "",
          dueDate: d0,
          paidAt: withdrawal ? d0 : null,
          counterpart: "",
          notes: "",
          ...(withdrawal ? { categoryId: withdrawalCategory?.id ?? null, withdrawalAccountId: personal?.sources[0]?.id ?? null } : {}),
        }}
      />
      <p className="small muted">Para dinheiro que vai de uma empresa para outra, use Entre empresas no Consolidado.</p>
    </div>
  );
}
