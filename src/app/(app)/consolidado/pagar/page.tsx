import { BillsView } from "@/components/BillsView";
import { PageHead } from "@/components/PageHead";
import { consolidatedContext, type SearchParams } from "@/lib/page";

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
        searchParams={sp}
        basePath="/consolidado/pagar"
      />
    </>
  );
}
