import { PageHead } from "@/components/PageHead";
import { PendingList } from "@/components/PendingList";
import { consolidatedContext, param, type SearchParams } from "@/lib/page";

export default async function ConsolidadoContasPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const t = param(sp, "tipo");
  const filter = t === "receber" || t === "pagar" ? t : "todas";
  const { companies } = await consolidatedContext();
  return (
    <>
      <PageHead context="Consolidado" title="Contas a pagar e a receber" />
      <PendingList companies={companies} consolidated filter={filter} basePath="/consolidado/contas" />
    </>
  );
}
