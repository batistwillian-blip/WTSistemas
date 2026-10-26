import { Overview } from "@/components/Overview";
import { consolidatedContext } from "@/lib/page";

export default async function ConsolidadoPage() {
  const { companies } = await consolidatedContext();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Consolidado</h1>
          <p className="muted small">{companies.map((c) => c.name).join(" · ")}</p>
        </div>
      </div>
      <Overview companies={companies} consolidated />
    </>
  );
}
