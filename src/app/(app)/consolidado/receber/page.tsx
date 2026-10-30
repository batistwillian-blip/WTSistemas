import { BillsView } from "@/components/BillsView";
import { PageHead } from "@/components/PageHead";
import { consolidatedContext, type SearchParams } from "@/lib/page";

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { companies } = await consolidatedContext();
  return (
    <>
      <PageHead context="Consolidado · Financeiro" title="Contas a receber" />
      <BillsView
        companies={companies}
        consolidated
        type="entrada"
        searchParams={sp}
        basePath="/consolidado/receber"
      />
    </>
  );
}
