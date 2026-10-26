import { desc, eq } from "drizzle-orm";
import { runChServerSync } from "@/app/actions/integracoes";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { PageHead } from "@/components/PageHead";
import { db } from "@/db";
import { integrationRuns, integrationSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { readChConfig, splitBaseUrl } from "@/lib/chserver";
import { allCompanies, getAccounts } from "@/lib/queries";
import { ChSettingsForm } from "./ChSettingsForm";

function fmt(d: Date) {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export default async function IntegracoesPage() {
  await requireAdmin();
  const companies = await allCompanies();
  const [[settings], runs, accounts] = await Promise.all([
    db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver")),
    db.select().from(integrationRuns).where(eq(integrationRuns.source, "chserver")).orderBy(desc(integrationRuns.startedAt)).limit(15),
    getAccounts(companies.map((c) => c.id), true),
  ]);
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
        subtitle="Importa as contas a receber e a pagar do sistema de vendas. Só leitura: nada é alterado no CHServer."
      />

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
          }}
        />
      </div>

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
            O que é importado: títulos de Receber e Pagar com vencimento entre 60 dias atrás e 120 dias à frente. Título com data de baixa entra como
            realizado. Os lançamentos importados aparecem com a etiqueta “Automático” e não podem ser editados aqui; a correção é feita no CHServer.
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
