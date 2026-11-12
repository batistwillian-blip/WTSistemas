import "server-only";
import type { User } from "@/db/schema";
import { getPersonal, getUserCompanies } from "./access";
import { auraCan } from "./aura";

export type Module = { key: "aura" | "caixa" | "admin"; href: string; title: string; desc: string; icon: string };

/** Sistemas do portal que o usuário pode abrir, na ordem em que aparecem na tela de início. */
export async function userModules(user: User): Promise<Module[]> {
  const [companies, personal] = await Promise.all([getUserCompanies(user), getPersonal(user)]);
  const list: Module[] = [];
  if (auraCan(user, "ver"))
    list.push({ key: "aura", href: "/aura", title: "Central de vendas da Aura", desc: "Leads, funil, Kanban e o trabalho da Aurora.", icon: "🎯" });
  if (user.isAdmin || companies.length > 0 || personal)
    list.push({ key: "caixa", href: "/", title: "Caixa consolidado", desc: "Entradas, saídas, contas a pagar e receber das empresas.", icon: "💰" });
  return list;
}
