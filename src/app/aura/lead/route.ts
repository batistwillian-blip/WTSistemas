import { getCurrentUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { AURA_MODO_TESTE, addAuraLead, auraAccessOf, auraConfigured, parseLead } from "@/lib/aura";
import { sameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Lead que chegou fora da Aurora (indicação, polo, ligação...): entra no Kanban e segue o funil normal.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, erro: "origem não permitida" }, 403);
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ ok: false, erro: "faça login de novo" }, 401);
  if (auraAccessOf(user) !== "mover") return json({ ok: false, erro: "seu acesso é só de consulta" }, 403);
  const l = parseLead(await req.json().catch(() => null));
  if ("erro" in l) return json({ ok: false, erro: l.erro }, 400);
  if (!AURA_MODO_TESTE) {
    if (!auraConfigured()) return json({ ok: false, erro: "Central não configurada" }, 503);
    try {
      await addAuraLead(l, user.name);
    } catch (e) {
      console.error("Central Aura: falha ao adicionar lead:", e);
      return json({ ok: false, erro: e instanceof Error ? e.message : "o n8n não confirmou" }, 502);
    }
  }
  await logChange({ user, action: AURA_MODO_TESTE ? "adicionar_lead_teste" : "adicionar_lead", entity: "aura_lead", entityId: l.numero, after: l });
  return json({ ok: true, teste: AURA_MODO_TESTE });
}
