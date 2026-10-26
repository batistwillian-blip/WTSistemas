import { PageHead } from "@/components/PageHead";
import { parseDays, ProjectionView } from "@/components/ProjectionView";
import { consolidatedContext, param, type SearchParams } from "@/lib/page";

export default async function ConsolidadoProjecaoPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseDays(param(await searchParams, "dias"));
  const { companies } = await consolidatedContext();
  return (
    <>
      <PageHead context="Consolidado" title="Projeção de caixa" />
      <ProjectionView companies={companies} days={days} basePath="/consolidado/projecao" consolidated />
    </>
  );
}
