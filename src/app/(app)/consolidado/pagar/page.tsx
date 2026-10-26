import { BillsView } from "@/components/BillsView";
import { PageHead } from "@/components/PageHead";
import { consolidatedContext, param, type SearchParams } from "@/lib/page";
import { readPeriod } from "@/lib/period";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { companies } = await consolidatedContext();
  return (
    <>
      <PageHead context="Consolidado · Financeiro" title="Contas a pagar" />
      <BillsView
        companies={companies}
        consolidated
        type="saida"
        status={param(sp, "situacao") === "pagas" ? "pagas" : "abertas"}
        period={readPeriod(sp)}
        basePath="/consolidado/pagar"
      />
    </>
  );
}
