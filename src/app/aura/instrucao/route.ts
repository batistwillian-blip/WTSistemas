import { getCurrentUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { AURA_MODO_TESTE, auraCan, auraConfigured, parseInstrucao, saveAuraInstrucao } from "@/lib/aura";
import { sameOrigin } from "@/lib/same-origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Orientações da Aurora: só para quem tem a permissão "Ensinar a Aurora".
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, erro: "origem não permitida" }, 403);
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ ok: false, erro: "faça login de novo" }, 401);
  if (!auraCan(user, "ensinar")) return json({ ok: false, erro: "seu usuário não pode ensinar a Aurora" }, 403);
  const i = parseInstrucao(await req.json().catch(() => null));
  if ("erro" in i) return json({ ok: false, erro: i.erro }, 400);
  let chave = i.acao === "remover" ? i.chave : `teste${Date.now().toString(36)}`;
  if (!AURA_MODO_TESTE) {
    if (!auraConfigured()) return json({ ok: false, erro: "Central não configurada" }, 503);
    try {
      const nova = await saveAuraInstrucao(i, user.name);
      if (i.acao === "adicionar") chave = nova;
    } catch (e) {
      console.error("Central Aura: falha ao salvar orientação:", e);
      return json({ ok: false, erro: e instanceof Error ? e.message : "o n8n não confirmou" }, 502);
    }
  }
  const action = `${i.acao === "remover" ? "remover" : "adicionar"}_orientacao${AURA_MODO_TESTE ? "_teste" : ""}`;
  await logChange({ user, action, entity: "aura_instrucao", entityId: chave, after: i });
  return json({ ok: true, chave, teste: AURA_MODO_TESTE });
}
