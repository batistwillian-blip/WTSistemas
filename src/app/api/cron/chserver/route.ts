import { timingSafeEqual } from "node:crypto";
import { syncChServer } from "@/lib/chserver-sync";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Chamada pelo agendador da hospedagem a cada 15 minutos.
export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Não autorizado", { status: 401 });
  const result = await syncChServer();
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
