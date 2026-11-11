import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { AURA_MODO_TESTE, auraAccessOf, auraConfigured, fetchAuraData, renderPanel } from "@/lib/aura";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

function aviso(titulo: string, texto: string, status = 200) {
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Central de vendas da Aura</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#070814;color:#eef0ff;font:15px/1.5 system-ui,sans-serif;padding:16px}div{max-width:420px;text-align:center}a{color:#22d3ee}</style></head>
<body><div><h1 style="font-size:20px">${titulo}</h1><p style="color:#8a90b8">${texto}</p><p><a href="/inicio">← Voltar ao início</a></p></div></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

export async function GET() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/conta?primeiro=1");
  const access = auraAccessOf(user);
  if (!access) return aviso("Sem acesso", "Seu usuário não tem acesso à Central de vendas da Aura. Fale com o administrador.", 403);
  if (!auraConfigured()) return aviso("Central ainda não ligada", "Falta configurar a ligação com o n8n da Aura (AURA_N8N_CHAVE).", 503);
  let dados;
  try {
    dados = await fetchAuraData();
  } catch (e) {
    console.error("Central Aura: falha ao buscar dados no n8n:", e);
    return aviso("Não consegui carregar a Central", "O n8n da Aura não respondeu agora. Tente de novo em alguns segundos.", 502);
  }
  const html = await renderPanel({
    negado: false,
    ...dados,
    teste: dados.teste ?? [],
    gerado: new Date().toISOString(),
    usuario: user.name,
    podeMover: access === "mover",
    modoTeste: AURA_MODO_TESTE,
  });
  return new Response(html, { headers: HEADERS });
}
