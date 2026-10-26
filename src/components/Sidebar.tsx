"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Group = { title: string; color?: string; links: { href: string; label: string }[] };

export function SidebarNav({ groups }: { groups: Group[] }) {
  const path = usePathname();
  // O link ativo é o de caminho mais longo que casa com a URL atual.
  const all = groups.flatMap((g) => g.links.map((l) => l.href));
  const active = all
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <>
      {groups.map((g) => (
        <nav key={g.title}>
          <div className="group-title">
            {g.color && <span className="dot" style={{ background: g.color }} />}
            {g.title}
          </div>
          {g.links.map((l) => (
            <Link key={l.href} href={l.href} className={l.href === active ? "active" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
      ))}
    </>
  );
}
