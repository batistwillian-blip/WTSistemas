import Link from "next/link";
import { presets, type Period } from "@/lib/period";

/** Atalhos de período e campos de data. Os outros parâmetros da URL (ex.: situação) são mantidos. */
export function PeriodFilter({ period, keep = {} }: { period: Period; keep?: Record<string, string> }) {
  const qs = (extra: Record<string, string>) => "?" + new URLSearchParams({ ...keep, ...extra }).toString();
  return (
    <div className="filters" style={{ alignItems: "end" }}>
      <div className="tabs">
        {presets().map((p) => (
          <Link key={p.key} href={qs({ de: p.from, ate: p.to })} className={period.preset === p.key ? "on" : undefined}>
            {p.label}
          </Link>
        ))}
      </div>
      <form method="get" className="filters" style={{ alignItems: "end", gap: 8 }}>
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="small">
          De
          <input type="date" name="de" defaultValue={period.from} />
        </label>
        <label className="small">
          Até
          <input type="date" name="ate" defaultValue={period.to} />
        </label>
        <button className="btn sm" type="submit">
          Filtrar
        </button>
      </form>
    </div>
  );
}
