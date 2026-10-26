import { PendingList } from "@/components/PendingList";
import { requireCompany } from "@/lib/access";
import { param, type SearchParams } from "@/lib/page";

export default async function ContasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const t = param(await searchParams, "tipo");
  const filter = t === "receber" || t === "pagar" ? t : "todas";
  const { company } = await requireCompany(slug);
  return (
    <>
      <div className="page-head">
        <h1>A pagar e receber · {company.name}</h1>
      </div>
      <PendingList companies={[company]} consolidated={false} filter={filter} basePath={`/empresa/${slug}/contas`} />
    </>
  );
}
