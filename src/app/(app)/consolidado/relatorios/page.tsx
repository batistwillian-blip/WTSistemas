import { PageHead } from "@/components/PageHead";
import { ReportsView } from "@/components/ReportsView";
import { consolidatedContext, type SearchParams } from "@/lib/page";
import { readPeriod } from "@/lib/period";

export default async function ConsolidadoRelatoriosPage({ searchParams }: { searchParams: SearchParams }) {
  const { companies } = await consolidatedContext();
  return (
    <>
      <PageHead context="Consolidado · Financeiro" title="Relatórios" />
      <ReportsView companies={companies} consolidated period={readPeriod(await searchParams)} />
    </>
  );
}
