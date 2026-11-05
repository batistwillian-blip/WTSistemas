import "server-only";
import { redirect } from "next/navigation";
import { getUserCompanies } from "./access";
import { requireUser } from "./auth";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(sp: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export async function consolidatedContext() {
  const user = await requireUser();
  const companies = await getUserCompanies(user);
  // Consolidado só faz sentido para quem enxerga mais de uma empresa.
  if (companies.length < 2) redirect("/");
  return { user, companies };
}
