import { getUserCompanies } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { exportBillsCsv } from "@/lib/bills-export";

export async function GET(req: Request) {
  const user = await requireUser();
  if (user.mustChangePassword) return new Response("Troque a senha antes de exportar.", { status: 403 });
  const companies = await getUserCompanies(user);
  return exportBillsCsv({ companies, consolidated: true, type: "entrada", searchParams: new URL(req.url).searchParams, fileBase: "contas-a-receber-consolidado" });
}
