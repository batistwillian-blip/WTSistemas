import { setPaid } from "@/app/actions/lancamentos";
import { formatMoney, today } from "@/lib/format";
import { SettleButton } from "./SettleButton";
import { addDays } from "@/lib/format";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function dueStatus(dueDate: string, d0 = today()): [string, string] {
  if (dueDate < d0) {
    const d = daysBetween(dueDate, d0);
    return [`Vencido há ${d} ${d === 1 ? "dia" : "dias"}`, "red"];
  }
  if (dueDate === d0) return ["Vence hoje", "amber"];
  if (dueDate <= addDays(d0, 7)) {
    const d = daysBetween(d0, dueDate);
    return [`Em ${d} ${d === 1 ? "dia" : "dias"}`, "amber"];
  }
  return ["A vencer", ""];
}

type Item = {
  id: number;
  type: "entrada" | "saida";
  amount: number;
  dueDate: string;
  description: string;
  counterpart: string | null;
  source: "manual" | "chserver";
  accountId: number;
  originalAmount: number | null;
  transferId?: string | null;
};

/** Linha de conta pendente no estilo do protótipo: caixinha de data, descrição, situação e valor. */
export function DueItem({
  item,
  companyName,
  companyColor,
  canPay,
  accounts,
}: {
  item: Item;
  companyName?: string;
  companyColor?: string;
  canPay: boolean;
  /** Contas da empresa do item, para escolher de onde saiu/entrou o dinheiro na baixa. */
  accounts: { id: number; name: string }[];
}) {
  const [label, tone] = dueStatus(item.dueDate);
  return (
    <div className="li">
      <div className="date-box">
        <b>{item.dueDate.slice(8, 10)}</b>
        <small>{MONTHS[Number(item.dueDate.slice(5, 7)) - 1]}</small>
      </div>
      <div>
        <div className="t">
          {item.description} {item.source === "chserver" && <span className="badge blue">Automático</span>}
        </div>
        <div className="m">
          {companyName && (
            <span className="emp" style={{ fontSize: 12, marginRight: 8 }}>
              <span className="dot" style={{ background: companyColor }} />
              {companyName}
            </span>
          )}
          {item.counterpart}
          {item.originalAmount !== null && (
            <span className="small muted" style={{ marginLeft: 8 }}>
              restante de {formatMoney(item.originalAmount)}
            </span>
          )}
        </div>
      </div>
      <div className="li-r">
        <b className={`num ${item.type === "entrada" ? "pos" : "neg"}`}>
          {item.type === "entrada" ? "+" : "−"}
          {formatMoney(item.amount)}
        </b>
        <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span className={`badge ${tone}`}>{label}</span>
          {canPay &&
            (item.transferId ? (
              // Transferência entre empresas: os dois lados são baixados juntos, sem juros nem parcial.
              <form action={setPaid}>
                <input type="hidden" name="id" value={item.id} />
                <button className="btn sm" type="submit" title="Marcar a transferência como feita hoje">
                  Baixar
                </button>
              </form>
            ) : (
              <SettleButton item={item} accounts={accounts} today={today()} />
            ))}
        </span>
      </div>
    </div>
  );
}
