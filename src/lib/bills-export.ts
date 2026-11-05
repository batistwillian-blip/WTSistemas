import "server-only";
import type { CompanyWithRole } from "./access";
import { installmentLabel } from "./billing";
import { applyFilters, billRange, categoryOf, csvCell, readBillFilters, situation } from "./bills";
import { formatDate, today } from "./format";
import { billsInRange } from "./queries";

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Mesma lista da tela (mesmos filtros da URL) em CSV separado por ";" com vírgula decimal, que o Excel em português abre direto. */
export async function exportBillsCsv(opts: {
  companies: CompanyWithRole[];
  consolidated: boolean;
  type: "entrada" | "saida";
  searchParams: URLSearchParams;
  fileBase: string;
}): Promise<Response> {
  const d0 = today();
  const f = readBillFilters(Object.fromEntries(opts.searchParams), d0);
  const { from, to } = billRange(f, d0);
  const rows = applyFilters(
    await billsInRange(
      opts.companies.map((c) => c.id),
      opts.type,
      f.base,
      from,
      to,
      opts.consolidated,
    ),
    f,
    d0,
  );
  const byId = new Map(opts.companies.map((c) => [c.id, c.name]));
  const header = ["Empresa", "Documento", "Descrição", "Parcela", "Categoria", opts.type === "entrada" ? "Cliente" : "Fornecedor", "Competência", "Vencimento", "Situação", "Data pagamento", "Conta", "Valor", "Juros", "Desconto", "Observação"];
  const lines = rows.map((r) => {
    const s = situation(r, d0);
    return [
      byId.get(r.companyId),
      r.document,
      r.description,
      installmentLabel(r),
      categoryOf(r),
      r.counterpart,
      (r.competence ?? r.dueDate).slice(0, 7).split("-").reverse().join("/"),
      formatDate(r.dueDate),
      s === "paga" ? (opts.type === "entrada" ? "Recebida" : "Paga") : s === "vencida" ? "Vencida" : "Em aberto",
      r.paidAt ? formatDate(r.paidAt) : "",
      r.accountName,
      reais(r.amount),
      reais(r.interest),
      reais(r.discount),
      r.offBalance ? "Só consulta (CHServer)" : r.partialOf ? "Pagamento parcial" : "",
    ]
      .map(csvCell)
      .join(";");
  });
  const body = "﻿" + [header.join(";"), ...lines].join("\r\n");
  const name = `${opts.fileBase}-${f.month}.csv`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
