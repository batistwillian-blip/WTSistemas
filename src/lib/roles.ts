import type { Role } from "@/db/schema";

export type Permission = "ver" | "lancar" | "gerir";

const level: Record<Role, number> = { leitura: 1, lancador: 2, gestor: 3 };
const required: Record<Permission, number> = { ver: 1, lancar: 2, gerir: 3 };

export const roleLabels: Record<Role, string> = {
  leitura: "Somente leitura",
  lancador: "Lança e edita",
  gestor: "Gestor (também exclui e configura)",
};

export function roleAllows(role: Role | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return level[role] >= required[perm];
}
