import { requireCompany } from "@/lib/access";
import { exportBillsCsv } from "@/lib/bills-export";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { user, company } = await requireCompany(slug);
  if (user.mustChangePassword) return new Response("Troque a senha antes de exportar.", { status: 403 });
  return exportBillsCsv({ companies: [company], consolidated: false, type: "entrada", searchParams: new URL(req.url).searchParams, fileBase: `contas-a-receber-${slug}` });
}
