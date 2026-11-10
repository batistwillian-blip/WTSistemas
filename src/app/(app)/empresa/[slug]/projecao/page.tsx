import { PageHead } from "@/components/PageHead";
import { parseDays, ProjectionView } from "@/components/ProjectionView";
import { requireCompany } from "@/lib/access";
import { param, type SearchParams } from "@/lib/page";

export default async function ProjecaoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const days = parseDays(param(await searchParams, "dias"));
  const { company } = await requireCompany(slug);
  return (
    <>
      <PageHead context={company.name} color={company.color} title="Projeção de caixa" />
      <ProjectionView companies={[company]} days={days} basePath={`/empresa/${slug}/projecao`} consolidated={false} />
    </>
  );
}
