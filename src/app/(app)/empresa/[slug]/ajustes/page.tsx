import { saveAccount, saveCategory, toggleCategory } from "@/app/actions/ajustes";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { Money } from "@/components/Money";
import { requireCompany } from "@/lib/access";
import { accountKindLabels } from "@/lib/labels";
import { accountBalances, getAccounts, getCategories } from "@/lib/queries";

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
  const [accounts, balances, categories] = await Promise.all([
    getAccounts([company.id]),
    accountBalances([company.id]),
    getCategories(company.id),
  ]);
  const balanceOf = new Map(balances.map((b) => [b.id, b.balance]));

  return (
    <div className="stack">
      <div className="page-head">
        <h1>Ajustes · {company.name}</h1>
      </div>

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
    </div>
  );
}
