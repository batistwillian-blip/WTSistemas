// Permissões da Central de vendas da Aura, uma por ação (puro, sem servidor, para poder testar).

export const AURA_PERMS = ["ver", "mover", "ensinar", "lead"] as const;
export type AuraPerm = (typeof AURA_PERMS)[number];

export const auraPermLabels: Record<AuraPerm, { titulo: string; desc: string }> = {
  ver: { titulo: "Ver a Central", desc: "Leads, funil, Kanban e conversas da Aurora. Sem isto, não entra na Central." },
  mover: { titulo: "Mover cards", desc: "Arrastar o lead de etapa, marcar matrícula ou perda." },
  ensinar: { titulo: "Ensinar a Aurora", desc: "Escrever e remover orientações que a Aurora segue em todas as conversas." },
  lead: { titulo: "Adicionar lead", desc: "Cadastrar quem chegou por indicação, no polo ou por ligação." },
};

/** O que o usuário pode fazer na Central. O master pode tudo; sem "ver", nenhuma outra ação vale. */
export function auraPermsOf(user: { isAdmin: boolean; auraPerms: readonly string[] | null }): AuraPerm[] {
  if (user.isAdmin) return [...AURA_PERMS];
  const set = new Set(user.auraPerms ?? []);
  if (!set.has("ver")) return [];
  return AURA_PERMS.filter((p) => set.has(p));
}

export function auraCan(user: { isAdmin: boolean; auraPerms: readonly string[] | null }, perm: AuraPerm) {
  return auraPermsOf(user).includes(perm);
}

/** Lê as caixinhas do formulário. Marcar qualquer ação já inclui "ver", porque ninguém age no que não enxerga. */
export function parseAuraPerms(values: readonly unknown[]): AuraPerm[] {
  const set = new Set(values.map(String).filter((v): v is AuraPerm => (AURA_PERMS as readonly string[]).includes(v)));
  if (set.size) set.add("ver");
  return AURA_PERMS.filter((p) => set.has(p));
}
