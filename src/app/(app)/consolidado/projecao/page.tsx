import { parseDays, ProjectionView } from "@/components/ProjectionView";
import { consolidatedContext, param, type SearchParams } from "@/lib/page";

export default async function ConsolidadoProjecaoPage({ searchParams }: { searchParams: SearchParams }) {
  const days = parseDays(param(await searchParams, "dias"));
  const { companies } = await consolidatedContext();
  return (
    <>
      <div className="page-head">
        <h1>Projeção · Consolidado</h1>
      </div>
      <ProjectionView companies={companies} days={days} basePath="/consolidado/projecao" />
    </>
  );
}
