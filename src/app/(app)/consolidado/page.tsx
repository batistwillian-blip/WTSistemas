import { Overview } from "@/components/Overview";
import { PageHead } from "@/components/PageHead";
import { consolidatedContext, param, type SearchParams } from "@/lib/page";

export default async function ConsolidadoPage({ searchParams }: { searchParams: SearchParams }) {
  const { user, companies } = await consolidatedContext();
  const sp = await searchParams;
  return (
    <Overview
      companies={companies}
      consolidated
      month={param(sp, "mes")}
      userName={user.name}
      head={<PageHead context="Consolidado" title="Visão geral" action={{ href: "/consolidado/novo", label: "+ Novo lançamento" }} />}
    />
  );
}
