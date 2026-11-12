import { getCurrentUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { AURA_MODO_TESTE, auraCan, auraConfigured, parseNivel, setAuraNivel } from "@/lib/aura";
import { sameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Nível do lead (EJA, técnico, graduação, pós, mestrado): quem move cards também corrige o nível.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, erro: "origem não permitida" }, 403);
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ ok: false, erro: "faça login de novo" }, 401);
  if (!auraCan(user, "mover")) return json({ ok: false, erro: "seu usuário não pode alterar leads" }, 403);
  const n = parseNivel(await req.json().catch(() => null));
  if (!n) return json({ ok: false, erro: "dados inválidos" }, 400);
  if (!AURA_MODO_TESTE) {
    if (!auraConfigured()) return json({ ok: false, erro: "Central não configurada" }, 503);
    try {
      await setAuraNivel(n.numero, n.nivel);
    } catch (e) {
      console.error("Central Aura: falha ao salvar nível:", e);
      return json({ ok: false, erro: e instanceof Error ? e.message : "o n8n não confirmou" }, 502);
    }
  }
  await logChange({ user, action: AURA_MODO_TESTE ? "nivel_lead_teste" : "nivel_lead", entity: "aura_lead", entityId: n.numero, after: n });
  return json({ ok: true, teste: AURA_MODO_TESTE });
}
