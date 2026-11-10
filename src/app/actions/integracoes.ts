"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { accounts, integrationSettings, paymentMethodAccounts, transactions } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { buildBaseUrl, validateChConfig } from "@/lib/chserver";
import { importedOutsideBalance, loadChSettings, syncChServer, testChConnection } from "@/lib/chserver-sync";
import { isValidIsoDate } from "@/lib/format";
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
        baseUrl: buildBaseUrl(str(fd, "host", 200), str(fd, "port", 10)),
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
    const importReceivables = fd.get("importReceivables") === "on";
    const importPayables = fd.get("importPayables") === "on";
    const importSales = fd.get("importSales") === "on";
    if (!importPayables && !importReceivables && !importSales) throw new UserError("Marque o que importar: contas a pagar, a receber e/ou vendas.");
    // Saldo: por padrão nada do CH entra; o saldo inicial é lançado à mão.
    const paidAffectBalance = fd.get("paidAffectBalance") === "on";
    const salesAffectBalance = fd.get("salesAffectBalance") === "on";
    const from = str(fd, "balanceFrom", 10);
    if (from && !isValidIsoDate(from)) throw new UserError("Data do saldo inválida.");
    const balanceFrom = from || null;
    const paidId = int(fd, "paidAccountId");
    const [paidAccount] = paidId ? await db.select().from(accounts).where(eq(accounts.id, paidId)) : [];
    if (paidId && (!paidAccount || paidAccount.companyId !== account.companyId))
      throw new UserError("A conta das contas pagas tem de ser da mesma empresa da integração.");
    const values = {
      baseUrl: cfg.baseUrl,
      cnpj: cfg.cnpj,
      companyKey: cfg.companyKey,
      tokenEncrypted: tokenChanged || !current ? encryptSecret(cfg.token) : current.tokenEncrypted,
      companyId: account.companyId,
      accountId: account.id,
      enabled,
      importReceivables,
      importPayables,
      importSales,
      paidAffectBalance,
      salesAffectBalance,
      balanceFrom,
      paidAccountId: paidAccount?.id ?? null,
      updatedAt: new Date(),
      updatedBy: admin.id,
    };
    await db
      .insert(integrationSettings)
      .values({ source: "chserver", ...values })
      .onConflictDoUpdate({ target: integrationSettings.source, set: values });
    // O token nunca vai para o log: registramos apenas se ele foi trocado.
    const visible = (v: typeof values | typeof current) =>
      v && { endereco: v.baseUrl, cnpj: v.cnpj, chave: v.companyKey, empresa: v.companyId, conta: v.accountId, ativa: v.enabled,
        pagar: v.importPayables, receber: v.importReceivables, vendas: v.importSales, pagasNoSaldo: v.paidAffectBalance, vendasNoSaldo: v.salesAffectBalance, saldoDesde: v.balanceFrom, contaPagos: v.paidAccountId };
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

/** Remove do caixa os títulos a receber que vieram do CHServer. Lançamentos manuais nunca são tocados. */
export async function clearImportedReceivables(_prev: ActionState): Promise<ActionState> {
  return guard(async () => {
    const admin = await requireAdmin();
    const [settings] = await db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver"));
    const rows = await db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(and(eq(transactions.source, "chserver"), like(transactions.externalId, "receber:%"), isNull(transactions.deletedAt)))
      .returning({ id: transactions.id, amount: transactions.amount, companyId: transactions.companyId });
    await logChange({
      user: admin,
      companyId: settings?.companyId ?? null,
      action: "limpar_receber_importado",
      entity: "integracao_chserver",
      after: { removidos: rows.length, valorTotal: rows.reduce((s, r) => s + r.amount, 0) },
    });
    revalidatePath("/", "layout");
    // O cartão some quando não há mais títulos; o aviso vai pela URL para continuar visível.
    redirect(`/admin/integracoes?removidos=${rows.length}`);
  });
}

/** Tira do saldo (sem apagar) os pagamentos e vendas do dia importados do CH que estão fora das opções de saldo. Lançamentos manuais nunca são tocados. */
export async function clearImportedBalance(_prev: ActionState): Promise<ActionState> {
  return guard(async () => {
    const admin = await requireAdmin();
    const [settings] = await db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver"));
    if (!settings) throw new UserError("Integração não configurada.");
    const rules = { paid: settings.paidAffectBalance, sales: settings.salesAffectBalance, from: settings.balanceFrom };
    const rows = await db
      .update(transactions)
      .set({ offBalance: true, updatedAt: new Date() })
      .where(importedOutsideBalance(rules))
      .returning({ id: transactions.id, amount: transactions.amount, type: transactions.type });
    await logChange({
      user: admin,
      companyId: settings.companyId,
      action: "zerar_saldo_importado",
      entity: "integracao_chserver",
      after: {
        removidos: rows.length,
        saidas: rows.filter((r) => r.type === "saida").reduce((s, r) => s + r.amount, 0),
        entradas: rows.filter((r) => r.type === "entrada").reduce((s, r) => s + r.amount, 0),
        regras: rules,
      },
    });
    revalidatePath("/", "layout");
    redirect(`/admin/integracoes?zerados=${rows.length}`);
  });
}

/** Em que conta cai cada forma de pagamento das vendas e em quantos dias. Vale a partir da próxima importação (refaz os últimos 40 dias). */
export async function savePaymentMethods(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const admin = await requireAdmin();
    const [settings] = await db.select().from(integrationSettings).where(eq(integrationSettings.source, "chserver"));
    if (!settings) throw new UserError("Configure a conexão primeiro.");
    const own = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.companyId, settings.companyId));
    const ownIds = new Set(own.map((a) => a.id));
    const rows: { companyId: number; method: string; accountId: number; days: number }[] = [];
    for (let i = 0; fd.has(`m_${i}`); i++) {
      const method = str(fd, `m_${i}`, 80);
      const accountId = int(fd, `a_${i}`);
      const days = int(fd, `d_${i}`) ?? 0;
      if (!method || !accountId) continue;
      if (!ownIds.has(accountId)) throw new UserError("Conta inválida para a forma " + method + ".");
      if (days < 0 || days > 60) throw new UserError("O prazo vai de 0 a 60 dias.");
      rows.push({ companyId: settings.companyId, method, accountId, days });
    }
    await db.transaction(async (tx) => {
      await tx.delete(paymentMethodAccounts).where(eq(paymentMethodAccounts.companyId, settings.companyId));
      if (rows.length) await tx.insert(paymentMethodAccounts).values(rows);
      await logChange(
        { user: admin, companyId: settings.companyId, action: "configurar", entity: "formas_pagamento", after: rows.map((r) => `${r.method} → ${r.accountId} (D+${r.days})`) },
        tx,
      );
    });
    revalidatePath("/admin/integracoes");
    return { ok: "Formas de pagamento salvas. A próxima importação refaz as vendas dos últimos 40 dias com essas contas." };
  });
}
