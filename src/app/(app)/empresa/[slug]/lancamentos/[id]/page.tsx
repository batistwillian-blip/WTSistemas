import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { notFound } from "next/navigation";
import { requireCompany } from "@/lib/access";
import { formatDate, today } from "@/lib/format";
import { getAccounts, getCategories, getPeople, getTransaction } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";
import { installmentLabel } from "@/lib/billing";
import { TransactionForm } from "../TransactionForm";

export default async function EditarLancamentoPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { company, role } = await requireCompany(slug);
  const tx = /^\d+$/.test(id) ? await getTransaction(Number(id)) : null;
  if (!tx || tx.companyId !== company.id) notFound();
  const editable = roleAllows(role, "lancar") && tx.source === "manual" && !tx.transferId;
  const [accounts, categories, people] = await Promise.all([getAccounts([company.id]), getCategories(company.id), getPeople(company.id)]);
  return (
    <div className="stack">
      <PageHead context={company.name} color={company.color} title={`${editable ? "Editar lançamento" : "Lançamento"}${tx.installment ? ` · parcela ${installmentLabel(tx)}` : ""}`} subtitle={<Link href={`/empresa/${slug}/lancamentos`}>← Voltar para lançamentos</Link>} />
      {tx.source === "chserver" && (
        <div className="alert info">Importado do CHServer. Alterações devem ser feitas lá; a próxima sincronização atualiza aqui.</div>
      )}
      {tx.transferId && <div className="alert info">Faz parte de uma transferência entre empresas. Altere em Entre empresas.</div>}
      {editable ? (
        <TransactionForm
          companyId={company.id}
          accounts={accounts.filter((a) => a.active || a.id === tx.accountId)}
          categories={categories.filter((c) => c.active || c.id === tx.categoryId)}
          today={today()}
          people={people}
          categoriesHref={roleAllows(role, "gerir") ? `/empresa/${slug}/ajustes` : undefined}
          initial={{
            id: tx.id,
            type: tx.type,
            description: tx.description,
            amount: (tx.amount / 100).toFixed(2).replace(".", ","),
            dueDate: tx.dueDate,
            paidAt: tx.paidAt,
            accountId: tx.accountId,
            categoryId: tx.categoryId,
            counterpart: tx.counterpart ?? "",
            notes: tx.notes ?? "",
            recurrence: tx.recurrenceGroup ? (tx.recurrence ?? "mensal") : null,
            openEnded: tx.openEnded,
            installment: tx.installment,
            installments: tx.installments,
            document: tx.document,
            competence: tx.competence,
          }}
        />
      ) : (
        <div className="card">
          <p>
            <strong>{tx.description}</strong>
          </p>
          <p className="muted small">
            Vencimento {formatDate(tx.dueDate)} · {tx.paidAt ? `Baixado em ${formatDate(tx.paidAt)}` : "Pendente"}
            {tx.externalCategory && ` · Categoria no CH: ${tx.externalCategory}`}
          </p>
        </div>
      )}
    </div>
  );
}
