"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// heading abre um subgrupo (ex.: "Financeiro"); sub recua o link para dentro dele.
export type NavLink = { href: string; label: string; count?: number; heading?: string; sub?: boolean };
export type NavGroup = {
  key: string;
  title: string;
  color?: string;
  href: string;
  balance?: string;
  negative?: boolean;
  overdue?: number;
  links: NavLink[];
  section?: string;
};

function activeHref(groups: NavGroup[], path: string) {
  // O link ativo é o de caminho mais longo que casa com a URL atual.
  return groups
    .flatMap((g) => g.links.map((l) => l.href))
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
}

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const active = activeHref(groups, path);
  const current = groups.find((g) => g.links.some((l) => l.href === active))?.key;
  // Abre sempre o grupo da página atual; os outros abrem e fecham no clique da seta.
  const [open, setOpen] = useState<Set<string>>(() => new Set(current ? [current] : []));
  useEffect(() => {
    if (current) setOpen((s) => (s.has(current) ? s : new Set([...s, current])));
  }, [current]);
  const toggle = (key: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  let lastSection: string | undefined;
  return (
    <nav className="nav" aria-label="Empresas e seções">
      {groups.map((g) => {
        const isOpen = open.has(g.key);
        const header = g.section && g.section !== lastSection;
        lastSection = g.section;
        return (
          <div key={g.key}>
            {header && (
              <>
                <div className="nav-sep" />
                <div className="nav-label">{g.section}</div>
              </>
            )}
            <div className={`grp ${isOpen ? "open" : ""}`} style={{ ["--gc" as string]: g.color }}>
              <div style={{ position: "relative" }}>
                <Link className="grp-h" href={g.href} onClick={() => setOpen((s) => new Set([...s, g.key]))} aria-expanded={isOpen}>
                  {g.color ? <span className="dot" style={{ background: g.color }} /> : <span className="dot" style={{ background: "var(--side-muted)" }} />}
                  <b>{g.title}</b>
                  {!isOpen && g.overdue ? (
                    <span className="count" title="Contas vencidas">
                      {g.overdue}
                    </span>
                  ) : (
                    <span />
                  )}
                  <span
                    className="chev"
                    role="button"
                    aria-label={isOpen ? "Recolher" : "Expandir"}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle(g.key);
                    }}
                  >
                    ▶
                  </span>
                  {g.balance && <small className={g.negative ? "neg" : undefined}>{g.balance}</small>}
                </Link>
              </div>
              {isOpen && (
                <div className="grp-items">
                  {g.links.map((l) => (
                    <div key={l.href} style={{ display: "contents" }}>
                      {l.heading && <div className="nav-sub">{l.heading}</div>}
                      <Link
                        href={l.href}
                        className={`nav-i ${l.sub ? "sub" : ""} ${l.href === active ? "on" : ""}`}
                        aria-current={l.href === active ? "page" : undefined}
                      >
                        {l.label}
                        {l.count ? <span className="count">{l.count}</span> : null}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** Botão que mostra/esconde o menu no celular. */
export function MenuToggle() {
  const path = usePathname();
  useEffect(() => {
    document.querySelector(".sidebar")?.classList.remove("menu-open");
  }, [path]);
  return (
    <button className="menu-toggle" type="button" onClick={() => document.querySelector(".sidebar")?.classList.toggle("menu-open")}>
      Menu
    </button>
  );
}
