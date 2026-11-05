import { BillsView } from "@/components/BillsView";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { type SearchParams } from "@/lib/page";
import { roleAllows } from "@/lib/roles";

export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company, role } = await requireCompany(slug);
  return (
    <>
      <PageHead context={`${company.name} · Financeiro`} color={company.color} title="Contas a receber" action={roleAllows(role, "lancar") ? { href: `/empresa/${slug}/lancamentos/novo?tipo=entrada`, label: "+ Nova conta a receber" } : undefined} />
      <BillsView
        companies={[company]}
        consolidated={false}
        type="entrada"
        searchParams={sp}
        basePath={`/empresa/${slug}/receber`}
      />
    </>
  );
}
