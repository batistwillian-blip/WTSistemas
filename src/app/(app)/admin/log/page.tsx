import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { changedFields } from "@/lib/diff";
import { formatDate, formatMoney } from "@/lib/format";
import { param, type SearchParams } from "@/lib/page";
import { allCompanies } from "@/lib/queries";

const PAGE = 100;

const FIELD_LABELS: Record<string, string> = {
  amount: "valor",
  initialBalance: "saldo inicial",
  description: "descrição",
  dueDate: "vencimento",
  paidAt: "pago em",
  accountId: "conta",
  categoryId: "categoria",
  counterpart: "cliente/fornecedor",
  notes: "observações",
  type: "tipo",
  name: "nome",
  active: "ativo",
  isAdmin: "administrador",
  kind: "tipo",
  acessos: "acessos",
  mustChangePassword: "trocar senha",
};
const MONEY_FIELDS = new Set(["amount", "initialBalance"]);

function show(key: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (MONEY_FIELDS.has(key) && typeof v === "number") return formatMoney(v);
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

export default async function LogPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const empresa = Number(param(sp, "empresa")) || undefined;
  const usuario = Number(param(sp, "usuario")) || undefined;
  const entidade = param(sp, "entidade")?.slice(0, 40) || undefined;
  const pagina = Math.max(1, Number(param(sp, "pagina")) || 1);

  const where: SQL[] = [];
  if (empresa) where.push(eq(auditLog.companyId, empresa));
  if (usuario) where.push(eq(auditLog.userId, usuario));
  if (entidade) where.push(eq(auditLog.entity, entidade));

  const [rows, companies, people] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.at))
      .limit(PAGE + 1)
      .offset((pagina - 1) * PAGE),
    allCompanies(),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const hasNext = rows.length > PAGE;
  const qs = (p: number) => {
    const u = new URLSearchParams();
    if (empresa) u.set("empresa", String(empresa));
    if (usuario) u.set("usuario", String(usuario));
    if (entidade) u.set("entidade", entidade);
    u.set("pagina", String(p));
    return `?${u}`;
  };

  return (
    <div className="stack">
      <PageHead context="Administração" title="Log de alterações" subtitle="Quem criou, alterou, baixou ou excluiu o quê, com os valores antes e depois. Nem o sistema consegue apagar este registro." />
      <form className="filters card" method="get">
        <label>
          Empresa
          <select name="empresa" defaultValue={empresa ?? ""}>
            <option value="">Todas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Usuário
          <select name="usuario" defaultValue={usuario ?? ""}>
            <option value="">Todos</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Item
          <select name="entidade" defaultValue={entidade ?? ""}>
            <option value="">Todos</option>
            {["lancamento", "transferencia", "conta", "categoria", "usuario", "integracao_chserver"].map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Filtrar
        </button>
      </form>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Quem</th>
              <th>Empresa</th>
              <th>Ação</th>
              <th>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, PAGE).map((r) => {
              const diff = changedFields(r.before, r.after);
              return (
                <tr key={r.id}>
                  <td className="small">{r.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td className="small">
                    {r.userName}
                    {r.ip && <div className="muted">{r.ip}</div>}
                  </td>
                  <td className="small">{r.companyId ? names.get(r.companyId) : "—"}</td>
                  <td className="small">
                    <span className="badge">{r.action}</span> {r.entity} {r.entityId && <span className="muted">#{r.entityId}</span>}
                  </td>
                  <td className="small" style={{ maxWidth: 420 }}>
                    {diff.length > 0 ? (
                      diff.map((d) => (
                        <div key={d.key}>
                          <strong>{FIELD_LABELS[d.key] ?? d.key}</strong>: {show(d.key, d.from)} → {show(d.key, d.to)}
                        </div>
                      ))
                    ) : r.before || r.after ? (
                      <details>
                        <summary>ver dados</summary>
                        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(r.after ?? r.before, null, 2)}</pre>
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="filters">
        {pagina > 1 && (
          <Link className="btn" href={qs(pagina - 1)}>
            ← Mais recentes
          </Link>
        )}
        {hasNext && (
          <Link className="btn" href={qs(pagina + 1)}>
            Mais antigos →
          </Link>
        )}
      </div>
    </div>
  );
}
