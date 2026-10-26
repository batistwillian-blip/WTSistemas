import { desc, eq } from "drizzle-orm";
import { runChServerSync } from "@/app/actions/integracoes";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { db } from "@/db";
import { integrationRuns } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { readChConfig } from "@/lib/chserver";

export default async function IntegracoesPage() {
  await requireAdmin();
  let configured = false;
  let configError: string | null = null;
  try {
    configured = readChConfig() !== null;
  } catch (e) {
    configError = e instanceof Error ? e.message : "Configuração inválida.";
  }
  const runs = await db
    .select()
    .from(integrationRuns)
    .where(eq(integrationRuns.source, "chserver"))
    .orderBy(desc(integrationRuns.startedAt))
    .limit(20);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Integrações</h1>
          <p className="muted small">Leitura automática de dados de outros sistemas. Nenhuma integração altera dados no sistema de origem.</p>
        </div>
      </div>
      <div className="card stack">
        <h2>CHServer · Integrador BI (Primetech Loja)</h2>
        <p className="small">
          Lê as contas a receber e a pagar com vencimento entre 60 dias atrás e 120 dias à frente e grava como lançamentos da Primetech Loja. Títulos
          com data de baixa entram como realizados. Roda a cada 15 minutos pelo agendador da hospedagem.
        </p>
        <p className="small">
          Situação:{" "}
          {configError ? (
            <span className="badge red">{configError}</span>
          ) : configured ? (
            <span className="badge green">configurada</span>
          ) : (
            <span className="badge amber">não configurada</span>
          )}
        </p>
        {!configured && !configError && (
          <div className="alert info">
            Para ativar, cadastre na hospedagem as variáveis CHSERVER_URL, CHSERVER_TOKEN, CHSERVER_CNPJ e CHSERVER_CHAVE_EMPRESA. O token nunca deve ir
            para o código.
          </div>
        )}
        {configured && (
          <ActionForm action={runChServerSync} className="form">
            <div>
              <Submit className="btn">Sincronizar agora</Submit>
            </div>
          </ActionForm>
        )}
      </div>
      <div className="card table-wrap">
        <h2>Últimas execuções</h2>
        {runs.length === 0 ? (
          <p className="muted">Nenhuma execução ainda.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Início</th>
                <th>Resultado</th>
                <th>Mensagem</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="small">{r.startedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
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
    </div>
  );
}
