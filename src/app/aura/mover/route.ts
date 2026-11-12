import { getCurrentUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { AURA_MODO_TESTE, auraCan, auraConfigured, moveAuraCard, parseMove } from "@/lib/aura";
import { sameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, erro: "origem não permitida" }, 403);
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ ok: false, erro: "faça login de novo" }, 401);
  if (!auraCan(user, "mover")) return json({ ok: false, erro: "seu usuário não pode mover cards" }, 403);
  const m = parseMove(await req.json().catch(() => null));
  if (!m) return json({ ok: false, erro: "dados inválidos" }, 400);
  if (!AURA_MODO_TESTE) {
    if (!auraConfigured()) return json({ ok: false, erro: "Central não configurada" }, 503);
    try {
      await moveAuraCard(m, user.name);
    } catch (e) {
      console.error("Central Aura: falha ao mover card:", e);
      return json({ ok: false, erro: "o n8n não confirmou o movimento" }, 502);
    }
  }
  await logChange({ user, action: AURA_MODO_TESTE ? "mover_card_teste" : "mover_card", entity: "aura_lead", entityId: m.numero, after: m });
  return json({ ok: true, teste: AURA_MODO_TESTE });
}
