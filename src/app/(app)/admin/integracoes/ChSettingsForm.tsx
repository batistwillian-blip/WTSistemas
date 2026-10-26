"use client";

import { startTransition, useActionState } from "react";
import { saveChSettings, testChSettings } from "@/app/actions/integracoes";
import { Feedback } from "@/components/FormStatus";

type Account = { id: number; label: string; company: string };
export type ChFormInitial = {
  host: string;
  port: string;
  cnpj: string;
  companyKey: string;
  hasToken: boolean;
  accountId: number | null;
  enabled: boolean;
  importReceivables: boolean;
  importPayables: boolean;
};

export function ChSettingsForm({ initial, accounts }: { initial: ChFormInitial; accounts: Account[] }) {
  const [saveState, save, saving] = useActionState(saveChSettings, undefined);
  const [testState, test, testing] = useActionState(testChSettings, undefined);
  const companies = [...new Set(accounts.map((a) => a.company))];
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const which = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value");
        startTransition(() => (which === "test" ? test(fd) : save(fd)));
      }}
    >
      <div className="fields">
        <label>
          Servidor do CHServerWeb
          <input name="host" defaultValue={initial.host} placeholder="cloud.chlitoral.com.br" required autoComplete="off" />
        </label>
        <label>
          Porta do CHServerWeb
          <input name="port" defaultValue={initial.port} placeholder="8081" inputMode="numeric" maxLength={5} required autoComplete="off" />
        </label>
        <label>
          CNPJ da estrutura principal
          <input name="cnpj" defaultValue={initial.cnpj} placeholder="00.000.000/0000-00" required inputMode="numeric" autoComplete="off" />
        </label>
        <label>
          Chave da empresa no CHServer
          <input name="companyKey" defaultValue={initial.companyKey} placeholder="Ex.: 1" required autoComplete="off" />
        </label>
        <label>
          Token do Integrador BI
          <input
            name="token"
            type="password"
            placeholder={initial.hasToken ? "Já guardado. Deixe em branco para manter" : "Cole aqui o token"}
            required={!initial.hasToken}
            autoComplete="new-password"
          />
        </label>
        <label>
          Conta que recebe os lançamentos
          <select name="accountId" defaultValue={initial.accountId ?? ""} required>
            <option value="" disabled>
              Escolha
            </option>
            {companies.map((c) => (
              <optgroup key={c} label={c}>
                {accounts
                  .filter((a) => a.company === c)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Importação
          <select name="enabled" defaultValue={initial.enabled ? "on" : "off"}>
            <option value="on">Ativa (a cada 15 minutos)</option>
            <option value="off">Pausada</option>
          </select>
        </label>
      </div>
      <div className="filters">
        <label className="check">
          <input type="checkbox" name="importPayables" defaultChecked={initial.importPayables} /> Importar contas a pagar
        </label>
        <label className="check">
          <input type="checkbox" name="importReceivables" defaultChecked={initial.importReceivables} /> Importar contas a receber
        </label>
      </div>
      <div className="filters">
        <button className="btn primary" type="submit" value="save" disabled={saving}>
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
        <button className="btn" type="submit" value="test" disabled={testing}>
          {testing ? "Testando…" : "Testar conexão"}
        </button>
      </div>
      <Feedback state={testState} />
      <Feedback state={saveState} />
    </form>
  );
}
