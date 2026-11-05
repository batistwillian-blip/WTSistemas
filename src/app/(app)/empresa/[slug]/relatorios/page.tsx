import { PageHead } from "@/components/PageHead";
import { ReportsView } from "@/components/ReportsView";
import { requireCompany } from "@/lib/access";
import type { SearchParams } from "@/lib/page";
import { readPeriod } from "@/lib/period";

export default async function RelatoriosPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const { company } = await requireCompany(slug);
  return (
    <>
      <PageHead context={`${company.name} · Financeiro`} color={company.color} title="Relatórios" />
      <ReportsView companies={[company]} consolidated={false} period={readPeriod(await searchParams)} />
    </>
  );
}
