import { redirect } from "next/navigation";
import { param, type SearchParams } from "@/lib/page";

// A tela antiga juntava a pagar e a receber; agora cada um tem a sua no menu Financeiro.
export default async function ContasPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: SearchParams }) {
  const { slug } = await params;
  redirect(`/empresa/${slug}/${param(await searchParams, "tipo") === "receber" ? "receber" : "pagar"}`);
}
