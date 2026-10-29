import { BillsView } from "@/components/BillsView";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { param, type SearchParams } from "@/lib/page";
import { readPeriod } from "@/lib/period";
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
        status={param(sp, "situacao") === "pagas" ? "pagas" : "abertas"}
        period={readPeriod(sp)}
        basePath={`/empresa/${slug}/receber`}
      />
    </>
  );
}
