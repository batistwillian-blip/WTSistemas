import { redirect } from "next/navigation";
import { getUserCompanies } from "@/lib/access";
import { requireUser } from "@/lib/auth";

export default async function Home() {
  const user = await requireUser();
  const companies = await getUserCompanies(user);
  if (companies.length > 1) redirect("/consolidado");
  if (companies.length === 1) redirect(`/empresa/${companies[0].slug}`);
  return (
    <div className="card">
      <h1>Sem acesso</h1>
      <p className="muted">Seu usuário ainda não tem acesso a nenhuma empresa. Fale com o administrador.</p>
    </div>
  );
}
