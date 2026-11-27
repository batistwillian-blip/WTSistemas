import { getCurrentUser } from "@/lib/auth";
import { auraCan, auraConfigured, fetchAuraData } from "@/lib/aura";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Dados novos da Central para a atualização automática da tela (sem recarregar a página).
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return json({ ok: false, erro: "faça login de novo" }, 401);
  if (!auraCan(user, "ver")) return json({ ok: false, erro: "sem acesso" }, 403);
  if (!auraConfigured()) return json({ ok: false, erro: "Central não configurada" }, 503);
  try {
    const dados = await fetchAuraData();
    return json({ ok: true, ...dados, teste: dados.teste ?? [], gerado: new Date().toISOString() });
  } catch (e) {
    console.error("Central Aura: falha ao atualizar dados:", e);
    return json({ ok: false, erro: "o n8n não respondeu" }, 502);
  }
}
