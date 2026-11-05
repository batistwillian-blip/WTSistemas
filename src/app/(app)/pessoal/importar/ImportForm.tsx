"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { importExpenses } from "@/app/actions/pessoal";
import { ActionForm } from "@/components/ActionForm";
import { Submit } from "@/components/FormStatus";
import { formatDate, formatMoney } from "@/lib/format";
import { matchCategory, parseExpenses, UNSPECIFIED, type ImportRow } from "@/lib/personal-import";

const EXAMPLE = `[12:19, 01/10/2026] Willian: 100 presente Davi
[08:05, 02/10/2026] Willian: 15 reais - salgado
[11:00, 08/10/2026] Amor: 17,99 sabão em pó
19,99 spray cabelo

ou em planilha: 2026-10-05;438,00;Mercado;Mercado`;

export function ImportForm({ categories, accounts }: { categories: string[]; accounts: { id: number; name: string }[] }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(ImportRow & { key: number })[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  // Categorias da área Pessoal + "Não especificado" (criada ao lançar, se ainda não existir).
  const options = useMemo(() => (matchCategory(categories.map((name) => ({ name })), UNSPECIFIED) ? categories : [...categories, UNSPECIFIED]), [categories]);
  const fit = (name: string) => matchCategory(options.map((n) => ({ name: n })), name)?.name ?? UNSPECIFIED;

  const check = () => {
    const r = parseExpenses(text);
    setRows(r.rows.map((x, i) => ({ ...x, category: fit(x.category), key: i })));
    setSkipped(r.skipped);
  };
  const edit = (key: number, patch: Partial<ImportRow>) => setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const total = rows?.reduce((s, r) => s + r.amount, 0) ?? 0;
  const byCat = new Map<string, { total: number; n: number }>();
  for (const r of rows ?? []) {
    const c = byCat.get(r.category) ?? { total: 0, n: 0 };
    byCat.set(r.category, { total: c.total + r.amount, n: c.n + 1 });
  }
  const month = rows?.[0]?.date.slice(0, 7);

  return (
    <div className="stack">
      <div className="card form">
        <p className="help" style={{ margin: 0 }}>
          Cole a lista de gastos copiada do WhatsApp (uma mensagem por gasto; mensagem com vários itens, um por linha) ou de uma planilha no formato <b>data;valor;descrição;categoria</b>. O
          sistema separa por categoria e você confere antes de lançar.
        </p>
        <label>
          Lista de gastos
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} />
        </label>
        <div>
          <button type="button" className="btn primary" onClick={check} disabled={!text.trim()}>
            Conferir
          </button>
        </div>
      </div>

      {skipped.length > 0 && (
        <div className="alert warn" style={{ display: "grid", gap: 4 }}>
          <b>Estas linhas não foram entendidas (sem valor) e ficaram de fora:</b>
          {skipped.map((s, i) => (
            <span key={i} className="small">
              {s}
            </span>
          ))}
        </div>
      )}

      {rows && rows.length === 0 && <div className="alert error">Nenhum gasto encontrado. Confira se cada linha tem um valor.</div>}

      {rows && rows.length > 0 && (
        <ActionForm
          action={importExpenses}
          className="form card"
          review={() => ({
            title: "Lançar estes gastos?",
            body: (
              <p style={{ margin: 0 }}>
                {rows.length} gastos, total <b>{formatMoney(total)}</b>, todos como já pagos.
              </p>
            ),
            confirm: "Sim, lançar",
          })}
          success={(msg) => (
            <div className="card stack">
              <div className="alert ok">{msg}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Link className="btn primary" href={`/pessoal${month ? `?mes=${month}` : ""}`}>
                  Ver o mês
                </Link>
                <a className="btn" href="/pessoal/importar">
                  Importar outra lista
                </a>
              </div>
            </div>
          )}
        >
          <input type="hidden" name="rows" value={JSON.stringify(rows.map(({ date, amount, description, category }) => ({ date, amount, description, category })))} />
          <div className="panel-h">
            <h2>
              {rows.length} gastos · {formatMoney(total)}
            </h2>
          </div>
          <div className="list">
            {[...byCat.entries()]
              .sort((a, b) => b[1].total - a[1].total)
              .map(([name, c]) => (
                <div key={name} className="li" style={{ gridTemplateColumns: "1fr auto" }}>
                  <span>
                    {name} <span className="small muted">({c.n})</span>
                  </span>
                  <b className="num">{formatMoney(c.total)}</b>
                </div>
              ))}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Categoria</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="num">{formatDate(r.date)}</td>
                    <td>
                      <input value={r.description} maxLength={200} onChange={(e) => edit(r.key, { description: e.target.value })} aria-label="Descrição" />
                    </td>
                    <td>
                      <select value={r.category} onChange={(e) => edit(r.key, { category: e.target.value })} aria-label="Categoria">
                        {options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </td>
                    <td className="num" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatMoney(r.amount)}
                    </td>
                    <td>
                      <button type="button" className="btn sm" onClick={() => setRows((rs) => rs!.filter((x) => x.key !== r.key))} aria-label="Tirar da lista">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="fields">
            <label>
              Pago com
              <select name="accountId" defaultValue={accounts[0]?.id}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Todos entram como já pagos, na data de cada gasto. Gasto igual que já estiver lançado (mesma data, valor e descrição) é pulado.
          </p>
          <div>
            <Submit>Lançar {rows.length} gastos</Submit>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
