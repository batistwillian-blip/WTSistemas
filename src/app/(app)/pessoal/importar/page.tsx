import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { PageHead } from "@/components/PageHead";
import { getPersonal } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { personalCategories } from "@/lib/personal";
import { ImportForm } from "./ImportForm";

/** Importar gastos: cola a lista (WhatsApp ou planilha), confere categoria por categoria e lança tudo de uma vez como pago. */
export default async function ImportarPage() {
  const user = await requireUser();
  const personal = await getPersonal(user);
  if (!personal) redirect("/pessoal");
  const [cats, accs] = await Promise.all([
    personalCategories(personal.id),
    db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.companyId, personal.id), eq(accounts.viaCompany, false), eq(accounts.active, true)))
      .orderBy(asc(accounts.id)),
  ]);
  return (
    <div className="stack">
      <PageHead context="Pessoal" color={personal.color} title="Importar gastos" subtitle={<Link href="/pessoal">← Voltar para Meu mês</Link>} />
      <ImportForm categories={cats.filter((c) => c.active).map((c) => c.name)} accounts={accs} />
    </div>
  );
}
