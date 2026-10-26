import { parseDays, ProjectionView } from "@/components/ProjectionView";
import { requireCompany } from "@/lib/access";
import { param, type SearchParams } from "@/lib/page";

export default async function ProjecaoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const days = parseDays(param(await searchParams, "dias"));
  const { company } = await requireCompany(slug);
  return (
    <>
      <div className="page-head">
        <h1>Projeção · {company.name}</h1>
      </div>
      <ProjectionView companies={[company]} days={days} basePath={`/empresa/${slug}/projecao`} />
    </>
  );
}
