import { endSession } from "@/lib/auth";
import { sameOrigin } from "@/lib/same-origin";

export async function POST(req: Request) {
  if (sameOrigin(req)) await endSession();
  // Redireciona com caminho relativo: atrás do proxy do Render o req.url é o endereço interno.
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
