import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { requireCompany } from "@/lib/access";
import { formatDate, formatMoney } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";
import { peopleWithTotals } from "@/lib/queries";
import { roleAllows } from "@/lib/roles";

/** Clientes e fornecedores da empresa, cada um com o seu código e quanto já foi pago/recebido e quanto falta. */
export default async function PessoasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { company, role } = await requireCompany(slug);
  const kind = param(sp, "tipo") === "cliente" ? "cliente" : "fornecedor";
  const q = (param(sp, "q") ?? "").trim().slice(0, 100);
  const showInactive = param(sp, "inativos") === "1";
  const all = await peopleWithTotals(company.id, kind);
  const needle = q.toLocaleLowerCase("pt-BR");
  const list = all.filter(
    (r) =>
      (showInactive || r.person.active) &&
      (!needle || [r.person.name, r.person.code, r.person.taxId, r.person.phone, r.person.email].some((v) => v?.toLocaleLowerCase("pt-BR").includes(needle))),
  );
  const entrada = kind === "cliente";
  const billsBase = `/empresa/${slug}/${entrada ? "receber" : "pagar"}`;
  const sum = (k: "paid" | "open" | "overdue") => list.reduce((s, r) => s + r[k], 0);
  return (
    <div className="stack">
      <PageHead
        context={`${company.name} · Financeiro`}
        color={company.color}
        title="Clientes e fornecedores"
        action={roleAllows(role, "lancar") ? { href: `/empresa/${slug}/pessoas/nova?tipo=${kind}`, label: `+ Novo ${entrada ? "cliente" : "fornecedor"}` } : undefined}
      />
      <div className="tabs">
        <Link href={`/empresa/${slug}/pessoas`} className={!entrada ? "on" : undefined}>
          Fornecedores
        </Link>
        <Link href={`/empresa/${slug}/pessoas?tipo=cliente`} className={entrada ? "on" : undefined}>
          Clientes
        </Link>
      </div>
      <div className="grid k3">
        <div className="card kpi">
          <span className="label">{entrada ? "Já recebido" : "Já pago"}</span>
          <span className="value">{formatMoney(sum("paid"))}</span>
          <span className="sub">{list.length} cadastros</span>
        </div>
        <div className="card kpi">
          <span className="label">{entrada ? "A receber" : "A pagar"}</span>
          <span className={`value ${entrada ? "pos" : "neg"}`}>{formatMoney(sum("open"))}</span>
        </div>
        <div className="card kpi">
          <span className="label">Vencido</span>
          <span className={`value ${sum("overdue") ? "neg" : ""}`}>{formatMoney(sum("overdue"))}</span>
        </div>
      </div>
      <form method="get" className="card filters">
        {entrada && <input type="hidden" name="tipo" value="cliente" />}
        <label style={{ flex: 1, minWidth: 220 }}>
          Buscar
          <input name="q" defaultValue={q} placeholder="Nome, código, CPF/CNPJ, telefone ou e-mail" />
        </label>
        <label className="check">
          <input type="checkbox" name="inativos" value="1" defaultChecked={showInactive} /> Mostrar inativos
        </label>
        <button className="btn" type="submit">
          Filtrar
        </button>
      </form>
      <div className="card table-wrap">
        {list.length === 0 ? (
          <p className="muted">Nenhum cadastro {q ? "com essa busca" : "ainda"}.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>CPF/CNPJ</th>
                <th>Contato</th>
                <th className="num">{entrada ? "Recebido" : "Pago"}</th>
                <th className="num">Em aberto</th>
                <th className="num">Vencido</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map(({ person: p, paid, open, overdue, count, last }) => (
                <tr key={p.id} style={p.active ? undefined : { opacity: 0.55 }}>
                  <td className="doc">{p.code}</td>
                  <td>
                    <Link href={`/empresa/${slug}/pessoas/${p.id}`} style={{ color: "inherit", fontWeight: 500 }}>
                      {p.name}
                    </Link>
                    {!p.active && <span className="badge" style={{ marginLeft: 6 }}>inativo</span>}
                    <div className="small muted">
                      {count} {count === 1 ? "conta" : "contas"}
                      {last && ` · última ${formatDate(last)}`}
                    </div>
                  </td>
                  <td className="small">{p.taxId}</td>
                  <td className="small">{[p.phone, p.email].filter(Boolean).join(" · ")}</td>
                  <td className="num">{formatMoney(paid)}</td>
                  <td className={`num ${open ? (entrada ? "pos" : "neg") : ""}`}>{formatMoney(open)}</td>
                  <td className={`num ${overdue ? "neg" : ""}`}>{formatMoney(overdue)}</td>
                  <td>
                    <Link className="btn sm" href={`${billsBase}?mes=todas&fornecedor=${encodeURIComponent(p.name)}`}>
                      Ver contas
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
