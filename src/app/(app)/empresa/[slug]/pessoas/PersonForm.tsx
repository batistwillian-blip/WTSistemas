"use client";

import { savePerson } from "@/app/actions/pessoas";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";

export type PersonInitial = {
  id?: number;
  kind: "cliente" | "fornecedor";
  code?: string;
  name: string;
  taxId: string;
  phone: string;
  email: string;
  pix: string;
  address: string;
  notes: string;
  active?: boolean;
};

/** Cadastro de cliente/fornecedor: só o nome é obrigatório. */
export function PersonForm({ companyId, initial }: { companyId: number; initial: PersonInitial }) {
  const isNew = !initial.id;
  return (
    <ActionForm action={savePerson} className="form card" resetOnSuccess={isNew}>
      <input type="hidden" name="companyId" value={companyId} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {isNew ? (
        <div className="tabs">
          <label className="check">
            <input type="radio" name="kind" value="fornecedor" defaultChecked={initial.kind === "fornecedor"} /> Fornecedor
          </label>
          <label className="check">
            <input type="radio" name="kind" value="cliente" defaultChecked={initial.kind === "cliente"} /> Cliente
          </label>
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>
          {initial.kind === "cliente" ? "Cliente" : "Fornecedor"} · código <b className="doc">{initial.code}</b>
        </p>
      )}
      <div className="fields">
        <label style={{ gridColumn: "span 2" }}>
          Nome / razão social
          <input name="name" defaultValue={initial.name} maxLength={150} required />
        </label>
        <label>
          CPF ou CNPJ
          <input name="taxId" defaultValue={initial.taxId} maxLength={30} inputMode="numeric" placeholder="opcional" />
        </label>
        <label>
          Telefone / WhatsApp
          <input name="phone" defaultValue={initial.phone} maxLength={40} placeholder="opcional" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" defaultValue={initial.email} maxLength={150} placeholder="opcional" />
        </label>
        <label>
          Chave PIX
          <input name="pix" defaultValue={initial.pix} maxLength={150} placeholder="opcional" />
        </label>
        <label style={{ gridColumn: "span 2" }}>
          Endereço
          <input name="address" defaultValue={initial.address} maxLength={300} placeholder="opcional" />
        </label>
      </div>
      <label>
        Observações
        <textarea name="notes" defaultValue={initial.notes} maxLength={1000} />
      </label>
      {!isNew && (
        <label className="check">
          <input type="hidden" name="active" value="off" />
          <input type="checkbox" name="active" value="on" defaultChecked={initial.active} /> Ativo (inativos somem da lista do lançamento)
        </label>
      )}
      <div>
        <Submit>{isNew ? "Cadastrar" : "Salvar alterações"}</Submit>
      </div>
    </ActionForm>
  );
}
