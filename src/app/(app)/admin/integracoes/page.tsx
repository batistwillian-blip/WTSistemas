import { and, asc, desc, eq, gte, isNull, like, lte, sql } from "drizzle-orm";
import { clearImportedBalance, clearImportedReceivables, runChServerSync } from "@/app/actions/integracoes";
import { importedOutsideBalance } from "@/lib/chserver-sync";
import { ConfirmButton } from "@/components/FormStatus";
import { addMonths, formatDate, formatMoney, isValidIsoDate, monthEnd, monthStart, today } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { PageHead } from "@/components/PageHead";
import { db } from "@/db";
import { integrationRuns, integrationSettings, transactions } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { readChConfig, splitBaseUrl } from "@/lib/chserver";
import { param, type SearchParams } from "@/lib/page";
import { allCompanies, getAccounts } from "@/lib/queries";
import { ChSettingsForm } from "./ChSettingsForm";

function fmt(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default async function IntegracoesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const removed = Number(param(sp, "removidos"));
  const zeroed = param(sp, "zerados");
  // Conferência com o relatório "Contas a pagar" do CH (abertos/parciais por vencimento).
  const d0 = today();
  const fromParam = param(sp, "de") ?? "";
  const toParam = param(sp, "ate") ?? "";
  const checkFrom = isValidIsoDate(fromParam) ? fromParam : monthStart(d0);
  const checkTo = isValidIsoDate(toParam) ? toParam : monthEnd(addMonths(d0, 24));
  const companies = await allCompanies();
  const [settings] = await db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver"));
  const [runs, accounts, [importedReceivables], openPayables, [outsideBalance]] = await Promise.all([
    db.select().from(integrationRuns).where(eq(integrationRuns.source, "chserver")).orderBy(desc(integrationRuns.startedAt)).limit(15),
    getAccounts(companies.map((c) => c.id), true),
    db
      .select({ n: sql<number>`count(*)::int`, total: sql<number>`coalesce(sum(${transactions.amount}), 0)::bigint` })
      .from(transactions)
      .where(and(eq(transactions.source, "chserver"), like(transactions.externalId, "receber:%"), isNull(transactions.deletedAt))),
    db
      .select({ id: transactions.id, description: transactions.description, amount: transactions.amount, dueDate: transactions.dueDate })
      .from(transactions)
      .where(
        and(
          eq(transactions.source, "chserver"),
          like(transactions.externalId, "pagar:%"),
          isNull(transactions.deletedAt),
          isNull(transactions.paidAt),
          gte(transactions.dueDate, checkFrom),
          lte(transactions.dueDate, checkTo),
        ),
      )
      .orderBy(asc(transactions.dueDate), asc(transactions.id)),
    db
      .select({
        n: sql<number>`count(*)::int`,
        out: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'saida'), 0)::bigint`,
        in: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = 'entrada'), 0)::bigint`,
      })
      .from(transactions)
      .where(
        importedOutsideBalance({
          paid: settings?.paidAffectBalance ?? false,
          sales: settings?.salesAffectBalance ?? false,
          from: settings?.balanceFrom ?? null,
        }),
      ),
  ]);
  const openTotal = openPayables.reduce((s, t) => s + t.amount, 0);
  let envConfigured = false;
  try {
    envConfigured = !settings && readChConfig() !== null;
  } catch {
    envConfigured = false;
  }
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const loja = companies.find((c) => c.slug === "primetech-loja");
  const defaultAccount = accounts.find((a) => a.companyId === loja?.id && a.name === "Banco") ?? accounts[0];
  const last = runs[0];
  const configured = !!settings || envConfigured;

  return (
    <>
      <PageHead
        context="Primetech Loja"
        color={loja?.color}
        title="Integrador BI (CHServer)"
        subtitle="Importa as contas a pagar e as vendas do sistema da loja. Só leitura: nada é alterado no CHServer."
      />

      {removed > 0 && <div className="alert ok">{removed} títulos a receber importados foram removidos do caixa.</div>}
      {zeroed !== undefined && (
        <div className="alert ok">Saldo importado zerado: {zeroed} lançamentos do CH saíram do saldo. Agora lance o saldo inicial na conta.</div>
      )}
      <div className="card">
        <div className="panel-h">
          <h2>Situação</h2>
          <span className="status-ok small">
            <span className={`sync-dot ${!configured || settings?.enabled === false ? "off" : last && last.ok === false ? "bad" : ""}`} />
            {!configured
              ? "Ainda não configurada"
              : settings?.enabled === false
                ? "Pausada"
                : last
                  ? `Última importação ${fmt(last.startedAt)}: ${last.ok === false ? "falhou" : "ok"}`
                  : "Configurada, aguardando a primeira importação"}
          </span>
        </div>
        {last?.ok === false && <div className="alert error">{last.message}</div>}
        {configured && (
          <ActionForm action={runChServerSync} className="form">
            <div>
              <Submit className="btn">Importar agora</Submit>
            </div>
          </ActionForm>
        )}
      </div>

      <div className="card">
        <h2>Conferir com o relatório do CHServer</h2>
        <p className="help" style={{ marginBottom: 12 }}>
          No CH, tire o relatório Contas a pagar com status “Abertos/parciais”, filtrado por vencimento, no mesmo período. O total geral precisa bater com o
          total abaixo.
        </p>
        <form className="form" method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
          <label>
            Vencimento de
            <input type="date" name="de" defaultValue={checkFrom} />
          </label>
          <label>
            até
            <input type="date" name="ate" defaultValue={checkTo} />
          </label>
          <div>
            <button className="btn" type="submit">
              Conferir
            </button>
          </div>
        </form>
        <p>
          Em aberto no caixa, vindo do CHServer, de {formatDate(checkFrom)} a {formatDate(checkTo)}: <b>{openPayables.length} títulos</b>, total{" "}
          <b>{formatMoney(openTotal)}</b>.
        </p>
        {openPayables.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary>Ver os {openPayables.length} títulos</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Vencimento</th>
                    <th>Descrição</th>
                    <th className="num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {openPayables.map((t) => (
                    <tr key={t.id}>
                      <td className="small">{formatDate(t.dueDate)}</td>
                      <td className="small">{t.description}</td>
                      <td className="num">{formatMoney(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      <div className="card">
        <h2>Conexão</h2>
        {envConfigured && (
          <div className="alert info" style={{ marginBottom: 12 }}>
            Hoje a conexão vem das variáveis do servidor. Se salvar aqui, esta configuração passa a valer.
          </div>
        )}
        <ChSettingsForm
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, company: names.get(a.companyId) ?? "" }))}
          initial={{
            ...(settings ? splitBaseUrl(settings.baseUrl) : { host: "", port: "8081" }),
            cnpj: settings?.cnpj ?? "",
            companyKey: settings?.companyKey ?? "",
            hasToken: !!settings,
            accountId: settings?.accountId ?? defaultAccount?.id ?? null,
            enabled: settings?.enabled ?? true,
            importPayables: settings?.importPayables ?? true,
            importSales: settings?.importSales ?? true,
            paidAffectBalance: settings?.paidAffectBalance ?? false,
            salesAffectBalance: settings?.salesAffectBalance ?? false,
            balanceFrom: settings?.balanceFrom ?? "",
          }}
        />
      </div>

      {outsideBalance.n > 0 && (
        <div className="card">
          <h2>Saldo vindo do CHServer</h2>
          <p style={{ marginBottom: 12 }}>
            Há <b>{outsideBalance.n}</b> lançamentos importados do CH mexendo no saldo fora das opções acima: pagamentos de{" "}
            <b>{formatMoney(Number(outsideBalance.out))}</b> e vendas de <b>{formatMoney(Number(outsideBalance.in))}</b>. Zere para o saldo ficar só com o
            que você lança. Nada é apagado: as contas pagas continuam em Contas a pagar → Pagos, só para consulta. Contas em aberto, vendas e
            lançamentos manuais não são afetados, e fica registrado no log.
          </p>
          <ActionForm action={clearImportedBalance} className="form">
            <div>
              <ConfirmButton
                className="btn danger"
                message={`Tirar do saldo ${outsideBalance.n} lançamentos importados do CH (pagamentos ${formatMoney(Number(outsideBalance.out))}, vendas ${formatMoney(Number(outsideBalance.in))})? Nada é apagado: as pagas ficam só para consulta em Contas a pagar → Pagos.`}
              >
                Zerar o saldo importado ({outsideBalance.n} lançamentos)
              </ConfirmButton>
            </div>
          </ActionForm>
        </div>
      )}

      {importedReceivables.n > 0 && (
        <div className="card">
          <h2>Títulos a receber importados</h2>
          <p style={{ marginBottom: 12 }}>
            Há <b>{importedReceivables.n}</b> títulos a receber vindos do CHServer no caixa, somando <b>{formatMoney(Number(importedReceivables.total))}</b>.
            O contas a receber do CH não é mais importado; remova esses títulos antigos para eles saírem do caixa. Lançamentos feitos à mão não são
            afetados, e a remoção fica registrada no log.
          </p>
          <ActionForm action={clearImportedReceivables} className="form">
            <div>
              <ConfirmButton
                className="btn danger"
                message={`Remover ${importedReceivables.n} títulos a receber importados do CHServer (${formatMoney(Number(importedReceivables.total))})? Lançamentos manuais não são afetados.`}
              >
                Remover {importedReceivables.n} títulos a receber importados
              </ConfirmButton>
            </div>
          </ActionForm>
        </div>
      )}

      <div className="card">
        <h2>Onde encontrar cada informação</h2>
        <div className="stack" style={{ gap: 10 }}>
          <p>
            <b>Servidor e porta:</b> o endereço externo do CHServerWeb e a porta da API (no seu caso, 8081). Não é a porta 3050, que é a do banco de dados.
            Peça ao suporte do CH se não souber.
          </p>
          <p>
            <b>CNPJ:</b> o CNPJ da estrutura principal cadastrada no ERP.
          </p>
          <p>
            <b>Chave da empresa:</b> o código da empresa dentro do CHServer (Primetech Loja).
          </p>
          <p>
            <b>Token:</b> gerado no CHServer em Configurações → Integrador BI. Ele fica guardado cifrado e nunca aparece de novo na tela. Se ele já foi
            mostrado para alguém, gere um novo no CHServer e cole aqui.
          </p>
          <p className="help">
            O que é importado: contas a pagar com vencimento entre 2 anos atrás e 5 anos à frente, seguindo a situação do CH (cancelado ou excluído
            não entra; pago fica em Contas a pagar → Pagos e só soma no saldo se “Somar as contas pagas no saldo do caixa” estiver marcado) e as
            vendas (notas de saída): na primeira vez os últimos 12 meses, depois os últimos 40 dias a cada importação. Com “Somar as vendas do dia no saldo do caixa” marcado, o total vendido em cada dia entra no caixa como “Vendas do dia”;
            notas canceladas e devoluções são descontadas. Nada disso vem marcado: o saldo é o que você lança. A cada importação, o que foi corrigido no CHServer é atualizado aqui, e o que foi excluído lá sai do caixa. O
            contas a receber do CH nunca é importado. Os lançamentos importados aparecem com a etiqueta “Automático” e não podem ser editados aqui; a correção é feita no CHServer.
          </p>
        </div>
      </div>

      <div className="card table-wrap">
        <h2>Últimas importações</h2>
        {runs.length === 0 ? (
          <p className="muted">Nenhuma importação ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Resultado</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fmt(r.startedAt)}</td>
                  <td>
                    {r.ok === null ? <span className="badge">em andamento</span> : r.ok ? <span className="badge green">ok</span> : <span className="badge red">falhou</span>}
                  </td>
                  <td className="small">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
