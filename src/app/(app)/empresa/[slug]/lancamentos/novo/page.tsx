import Link from "next/link";
import { requireCompany } from "@/lib/access";
import { today } from "@/lib/format";
import { getAccounts, getCategories } from "@/lib/queries";
import { TransactionForm } from "../TransactionForm";

export default async function NovoLancamentoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireCompany(slug, "lancar");
  const [accounts, categories] = await Promise.all([getAccounts([company.id], true), getCategories(company.id)]);
  const d0 = today();
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Novo lançamento · {company.name}</h1>
          <Link href={`/empresa/${slug}/lancamentos`} className="small">
            ← Lançamentos
          </Link>
        </div>
      </div>
      <TransactionForm
        companyId={company.id}
        accounts={accounts}
        categories={categories.filter((c) => c.active)}
        today={d0}
        initial={{ type: "saida", description: "", amount: "", dueDate: d0, paidAt: null, counterpart: "", notes: "" }}
      />
      <p className="small muted">Para dinheiro que vai de uma empresa para outra, use Entre empresas no Consolidado.</p>
    </div>
  );
}
