import { formatMoney } from "@/lib/format";

export function Money({ value, colored = false, signed = false }: { value: number; colored?: boolean; signed?: boolean }) {
  const cls = colored ? (value < 0 ? "neg" : value > 0 ? "pos" : undefined) : undefined;
  const text = signed && value > 0 ? "+" + formatMoney(value) : formatMoney(value);
  return <span className={cls}>{text}</span>;
}
