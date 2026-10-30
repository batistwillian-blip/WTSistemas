// Diferença simples entre dois objetos do log, para mostrar só o que mudou.
const IGNORE = new Set(["updatedAt", "createdAt"]);

export function changedFields(before: unknown, after: unknown): { key: string; from: unknown; to: unknown }[] {
  if (!before || !after || typeof before !== "object" || typeof after !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: { key: string; from: unknown; to: unknown }[] = [];
  for (const k of keys) {
    if (IGNORE.has(k)) continue;
    if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) out.push({ key: k, from: b[k], to: a[k] });
  }
  return out;
}
