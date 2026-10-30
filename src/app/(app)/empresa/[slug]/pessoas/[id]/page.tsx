import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { PageHead } from "@/components/PageHead";
import { db } from "@/db";
import { people } from "@/db/schema";
import { requireCompany } from "@/lib/access";
import { roleAllows } from "@/lib/roles";
import { PersonForm } from "../PersonForm";

export default async function PessoaPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { company, role } = await requireCompany(slug);
  const [p] = /^\d+$/.test(id) ? await db.select().from(people).where(and(eq(people.id, Number(id)), eq(people.companyId, company.id))) : [];
  if (!p) notFound();
  const bills = `/empresa/${slug}/${p.kind === "cliente" ? "receber" : "pagar"}?mes=todas&fornecedor=${encodeURIComponent(p.name)}`;
  return (
    <div className="stack">
      <PageHead
        context={company.name}
        color={company.color}
        title={`${p.code} · ${p.name}`}
        subtitle={
          <>
            <Link href={`/empresa/${slug}/pessoas?tipo=${p.kind}`}>← Voltar</Link> · <Link href={bills}>Ver todas as contas e a ficha</Link>
          </>
        }
      />
      {roleAllows(role, "lancar") ? (
        <PersonForm
          companyId={company.id}
          initial={{
            id: p.id,
            kind: p.kind as "cliente" | "fornecedor",
            code: p.code,
            name: p.name,
            taxId: p.taxId ?? "",
            phone: p.phone ?? "",
            email: p.email ?? "",
            pix: p.pix ?? "",
            address: p.address ?? "",
            notes: p.notes ?? "",
            active: p.active,
          }}
        />
      ) : (
        <div className="card">
          <p>
            {p.taxId && <>CPF/CNPJ {p.taxId} · </>}
            {p.phone} {p.email}
          </p>
        </div>
      )}
    </div>
  );
}
