import { saveAccount, saveCategory, saveTip, toggleCategory, toggleTip } from "@/app/actions/ajustes";
import { PageHead } from "@/components/PageHead";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { Money } from "@/components/Money";
import { requireCompany } from "@/lib/access";
import { accountKindLabels } from "@/lib/labels";
import { accountBalances, getAccounts, getCategories } from "@/lib/queries";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { seasonalTips } from "@/db/schema";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function MonthSelect({ value }: { value?: number }) {
  return (
    <select name="month" defaultValue={value ?? 1}>
      {MESES.map((m, i) => (
        <option key={m} value={i + 1}>
          {m}
        </option>
      ))}
    </select>
  );
}

function KindSelect({ value }: { value?: string }) {
  return (
    <select name="kind" defaultValue={value ?? "banco"}>
      {Object.entries(accountKindLabels).map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}

export default async function AjustesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { company } = await requireCompany(slug, "gerir");
  const [accounts, balances, categories, tips] = await Promise.all([
    getAccounts([company.id]),
    accountBalances([company.id]),
    getCategories(company.id),
    db.select().from(seasonalTips).where(eq(seasonalTips.companyId, company.id)).orderBy(asc(seasonalTips.month), asc(seasonalTips.id)),
  ]);
  const balanceOf = new Map(balances.map((b) => [b.id, b.balance]));

  return (
    <div className="stack">
      <PageHead context={company.name} color={company.color} title="Ajustes da empresa" subtitle="Contas (caixa físico, bancos, carteiras) e categorias." />

      <div className="card stack">
        <div>
          <h2>Contas (caixa físico, bancos, carteiras)</h2>
          <p className="small muted">
            O saldo inicial é o valor que a conta tinha antes do primeiro lançamento no sistema. Contas inativas somem dos formulários, mas o histórico
            fica.
          </p>
        </div>
        {accounts.map((a) => (
          <ActionForm key={a.id} action={saveAccount} className="form">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="id" value={a.id} />
            <div className="filters">
              <label>
                Nome
                <input name="name" defaultValue={a.name} required maxLength={80} />
              </label>
              <label>
                Tipo
                <KindSelect value={a.kind} />
              </label>
              <label>
                Saldo inicial (R$)
                <input name="initialBalance" defaultValue={(a.initialBalance / 100).toFixed(2).replace(".", ",")} inputMode="decimal" />
              </label>
              <label>
                Situação
                <select name="active" defaultValue={a.active ? "on" : "off"}>
                  <option value="on">Ativa</option>
                  <option value="off">Inativa</option>
                </select>
              </label>
              <div className="small" style={{ minWidth: 140 }}>
                Saldo hoje
                <br />
                <Money value={balanceOf.get(a.id) ?? 0} colored />
              </div>
              <Submit className="btn">Salvar</Submit>
            </div>
          </ActionForm>
        ))}
        <details className="box">
          <summary>Adicionar conta</summary>
          <ActionForm action={saveAccount} className="form">
            <input type="hidden" name="companyId" value={company.id} />
            <div className="filters" style={{ marginTop: 10 }}>
              <label>
                Nome
                <input name="name" required maxLength={80} placeholder="Ex.: Itaú, Mercado Pago" />
              </label>
              <label>
                Tipo
                <KindSelect />
              </label>
              <label>
                Saldo inicial (R$)
                <input name="initialBalance" inputMode="decimal" placeholder="0,00" />
              </label>
              <Submit>Adicionar</Submit>
            </div>
          </ActionForm>
        </details>
      </div>

      <div className="card stack">
        <h2>Categorias</h2>
        <div className="grid k2">
          {(["entrada", "saida"] as const).map((type) => (
            <div key={type}>
              <h3>{type === "entrada" ? "Entradas" : "Saídas"}</h3>
              <table>
                <tbody>
                  {categories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <tr key={c.id}>
                        <td className={c.active ? undefined : "muted"}>
                          {c.name} {!c.active && <span className="badge">inativa</span>}
                        </td>
                        <td>
                          <form action={toggleCategory} className="row-actions">
                            <input type="hidden" name="id" value={c.id} />
                            <button className="btn sm" type="submit">
                              {c.active ? "Desativar" : "Reativar"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <ActionForm action={saveCategory} className="form">
          <input type="hidden" name="companyId" value={company.id} />
          <div className="filters">
            <label>
              Nova categoria
              <input name="name" required maxLength={80} />
            </label>
            <label>
              Tipo
              <select name="type" defaultValue="saida">
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </select>
            </label>
            <Submit>Adicionar</Submit>
          </div>
        </ActionForm>
      </div>

      <div className="card stack" id="dicas">
        <div>
          <h2>Dicas do calendário</h2>
          <p className="small muted">Aparecem no painel no mês escolhido (e como &quot;prepare-se&quot; no mês anterior). Desative as que não fizerem sentido para a empresa.</p>
        </div>
        {tips.map((t) => (
          <details key={t.id} className="box" style={t.active ? undefined : { opacity: 0.55 }}>
            <summary>
              {MESES[t.month - 1]} · {t.title} {!t.active && <span className="badge">desativada</span>}
            </summary>
            <ActionForm action={saveTip} className="form">
              <input type="hidden" name="companyId" value={company.id} />
              <input type="hidden" name="id" value={t.id} />
              <div className="filters">
                <label>
                  Mês
                  <MonthSelect value={t.month} />
                </label>
                <label style={{ flex: 1 }}>
                  Título
                  <input name="title" defaultValue={t.title} maxLength={120} required />
                </label>
              </div>
              <label>
                Texto
                <textarea name="text" defaultValue={t.text} maxLength={600} required />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <Submit>Salvar dica</Submit>
              </div>
            </ActionForm>
            <form action={toggleTip} style={{ marginTop: 8 }}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn sm" type="submit">
                {t.active ? "Desativar" : "Ativar"}
              </button>
            </form>
          </details>
        ))}
        <ActionForm action={saveTip} className="form" resetOnSuccess>
          <input type="hidden" name="companyId" value={company.id} />
          <div className="filters">
            <label>
              Mês
              <MonthSelect />
            </label>
            <label style={{ flex: 1 }}>
              Nova dica
              <input name="title" maxLength={120} required placeholder="Ex.: Feira do bairro, aniversário da cidade" />
            </label>
          </div>
          <label>
            Texto
            <textarea name="text" maxLength={600} required />
          </label>
          <div>
            <Submit>Adicionar dica</Submit>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
