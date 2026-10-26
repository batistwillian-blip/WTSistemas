import { PendingList } from "@/components/PendingList";
import { consolidatedContext, param, type SearchParams } from "@/lib/page";

export default async function ConsolidadoContasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const t = param(sp, "tipo");
  const filter = t === "receber" || t === "pagar" ? t : "todas";
  const { companies } = await consolidatedContext();
  return (
    <>
      <div className="page-head">
        <h1>A pagar e receber · Consolidado</h1>
      </div>
      <PendingList companies={companies} consolidated filter={filter} basePath="/consolidado/contas" />
    </>
  );
}
