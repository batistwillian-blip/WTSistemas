import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { companyDescriptions } from "@/lib/labels";
import { consolidatedContext } from "@/lib/page";
import { roleAllows } from "@/lib/roles";

export default async function NovoConsolidadoPage() {
  const { companies } = await consolidatedContext();
  const allowed = companies.filter((c) => roleAllows(c.role, "lancar"));
  return (
    <>
      <PageHead context="Consolidado" title="Novo lançamento" subtitle="Escolha em qual empresa o dinheiro entra ou sai." />
      <div className="grid k3">
        {allowed.map((c) => (
          <Link key={c.id} href={`/empresa/${c.slug}/lancamentos/novo`} className="card company-card" style={{ ["--c" as string]: c.color }}>
            <h3>{c.name}</h3>
            <span className="small muted">{companyDescriptions[c.slug] ?? ""}</span>
            <span className="btn sm" style={{ alignSelf: "flex-start" }}>
              Lançar entrada ou saída
            </span>
          </Link>
        ))}
        <Link href="/consolidado/entre-empresas" className="card company-card" style={{ ["--c" as string]: "var(--accent)" }}>
          <h3>Entre empresas</h3>
          <span className="small muted">Empréstimo, devolução ou aporte de uma empresa para outra.</span>
          <span className="btn sm" style={{ alignSelf: "flex-start" }}>
            Registrar transferência
          </span>
        </Link>
      </div>
    </>
  );
}
