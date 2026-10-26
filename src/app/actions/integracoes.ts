"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, integrationSettings } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { validateChConfig } from "@/lib/chserver";
import { loadChSettings, syncChServer, testChConnection } from "@/lib/chserver-sync";
import { guard, int, str, UserError, type ActionState } from "@/lib/form";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

/** Lê o formulário. Token em branco = manter o que já está salvo. */
async function readForm(fd: FormData) {
  const [current] = await db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver"));
  const typedToken = str(fd, "token", 500);
  if (!typedToken && !current) throw new UserError("Informe o token do Integrador BI.");
  const cfg = (() => {
    try {
      return validateChConfig({
        baseUrl: str(fd, "baseUrl", 200),
        cnpj: str(fd, "cnpj", 30),
        companyKey: str(fd, "companyKey", 40),
        token: typedToken || decryptSecret(current!.tokenEncrypted),
      });
    } catch (e) {
      throw new UserError(e instanceof Error ? e.message : "Dados inválidos.");
    }
  })();
  const accountId = int(fd, "accountId");
  const [account] = accountId ? await db.select().from(accounts).where(and(eq(accounts.id, accountId))) : [];
  if (!account) throw new UserError("Escolha a conta que vai receber os lançamentos importados.");
  return { cfg, account, current, tokenChanged: !!typedToken };
}

export async function saveChSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const admin = await requireAdmin();
    const { cfg, account, current, tokenChanged } = await readForm(fd);
    const enabled = fd.get("enabled") !== "off";
    const values = {
      baseUrl: cfg.baseUrl,
      cnpj: cfg.cnpj,
      companyKey: cfg.companyKey,
      tokenEncrypted: tokenChanged || !current ? encryptSecret(cfg.token) : current.tokenEncrypted,
      companyId: account.companyId,
      accountId: account.id,
      enabled,
      updatedAt: new Date(),
      updatedBy: admin.id,
    };
    await db
      .insert(integrationSettings)
      .values({ source: "chserver", ...values })
      .onConflictDoUpdate({ target: integrationSettings.source, set: values });
    // O token nunca vai para o log: registramos apenas se ele foi trocado.
    const visible = (v: typeof values | typeof current) =>
      v && { endereco: v.baseUrl, cnpj: v.cnpj, chave: v.companyKey, empresa: v.companyId, conta: v.accountId, ativa: v.enabled };
    await logChange({
      user: admin,
      companyId: account.companyId,
      action: "configurar",
      entity: "integracao_chserver",
      before: visible(current),
      after: { ...visible(values), tokenTrocado: tokenChanged },
    });
    revalidatePath("/admin/integracoes");
    return { ok: "Configuração salva. Use “Testar conexão” para conferir." };
  });
}

export async function testChSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    await requireAdmin();
    const { cfg } = await readForm(fd);
    try {
      return { ok: await testChConnection(cfg) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Falha ao conectar." };
    }
  });
}

export async function runChServerSync(_prev: ActionState): Promise<ActionState> {
  const admin = await requireAdmin();
  if (!(await loadChSettings())) return { error: "Salve a configuração antes de importar." };
  const r = await syncChServer({ id: admin.id, name: admin.name });
  revalidatePath("/", "layout");
  return r.ok ? { ok: r.message } : { error: r.message };
}
