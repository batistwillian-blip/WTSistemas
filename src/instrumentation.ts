// Importação automática do CHServer enquanto o servidor estiver no ar: a cada 5 minutos verifica
// se a última importação tem mais de 15 minutos e, se a integração estiver configurada, roda de novo.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CHSERVER_AUTO === "off") return;
  const { lastRunAt, loadChSettings, syncChServer } = await import("./lib/chserver-sync");
  const INTERVAL = 15 * 60_000;
  const tick = async () => {
    try {
      const last = await lastRunAt();
      if (last && Date.now() - last.getTime() < INTERVAL) return;
      if (!(await loadChSettings())) return;
      const r = await syncChServer();
      console.log(`[chserver] ${r.ok ? "ok" : "falhou"}: ${r.message}`);
    } catch (e) {
      console.error("[chserver] erro na importação automática:", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, 5 * 60_000).unref();
}
