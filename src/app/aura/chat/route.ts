import { getCurrentUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { AURA_MODO_TESTE, auraCan, auraConfigured, conversarComAurora, parseChat } from "@/lib/aura";
import { sameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Conversa com a Aurora dentro da Central: perguntar dos leads, dar orientações, mover cards, deixar recados.
// É a mesma conversa do WhatsApp da equipe. Só para quem tem a permissão "Ensinar a Aurora".
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, erro: "origem não permitida" }, 403);
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ ok: false, erro: "faça login de novo" }, 401);
  if (!auraCan(user, "ensinar")) return json({ ok: false, erro: "seu usuário não pode falar com a Aurora" }, 403);
  const m = parseChat(await req.json().catch(() => null));
  if ("erro" in m) return json({ ok: false, erro: m.erro }, 400);
  if (!auraConfigured()) return json({ ok: false, erro: "Central não configurada" }, 503);
  try {
    const r = await conversarComAurora(m.texto, user.name, AURA_MODO_TESTE);
    if (r.acao !== "nenhuma") {
      await logChange({ user, action: `aurora_chat_${r.acao}`, entity: "aura_chat", entityId: r.chave || r.removida || "-", after: { texto: m.texto, resposta: r.resposta } });
    }
    return json({ ok: true, ...r, teste: AURA_MODO_TESTE });
  } catch (e) {
    console.error("Central Aura: falha na conversa com a Aurora:", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : "a Aurora não respondeu" }, 502);
  }
}
