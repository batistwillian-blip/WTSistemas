import { redirect } from "next/navigation";
import { param, type SearchParams } from "@/lib/page";

// A tela antiga juntava a pagar e a receber; agora cada um tem a sua no menu Financeiro.
export default async function ConsolidadoContasPage({ searchParams }: { searchParams: SearchParams }) {
  redirect(`/consolidado/${param(await searchParams, "tipo") === "receber" ? "receber" : "pagar"}`);
}
