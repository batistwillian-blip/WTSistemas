import Link from "next/link";

function todayText() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/** Cabeçalho das páginas: contexto (empresa ou consolidado), título, data de hoje e ação principal. */
export function PageHead({
  context,
  color,
  title,
  subtitle,
  action,
}: {
  context: string;
  color?: string;
  title: string;
  subtitle?: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow ctx">
          <span className="dot" style={{ background: color ?? "var(--accent)" }} />
          {context}
        </div>
        <h1>{title}</h1>
        <p className="muted">{subtitle ?? `Hoje é ${todayText()}`}</p>
      </div>
      {action && (
        <Link className="btn primary" href={action.href}>
          {action.label}
        </Link>
      )}
    </header>
  );
}
