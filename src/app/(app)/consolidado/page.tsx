import { Overview } from "@/components/Overview";
import { PageHead } from "@/components/PageHead";
import { consolidatedContext } from "@/lib/page";

export default async function ConsolidadoPage() {
  const { companies } = await consolidatedContext();
  return (
    <>
      <PageHead context="Consolidado" title="Visão geral" action={{ href: "/consolidado/novo", label: "+ Novo lançamento" }} />
      <Overview companies={companies} consolidated />
    </>
  );
}
