"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, companies, transactions } from "@/db/schema";
import { requireCompanyId } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { competenceOf, isMonthlySeries, moveSeriesDate, parsePlan, planSeries, settle, shiftCompetence, OPEN_ENDED_MONTHS, SYSTEM_DOC, type SeriesMode } from "@/lib/billing";
import { nextDocument } from "@/lib/documents";
import { findOrCreatePerson } from "@/lib/people";
import { syncWithdrawals } from "@/lib/withdrawals";
import { personKindOf } from "@/lib/people-sql";
import { addMonths, today } from "@/lib/format";
import { guard, int, isoDate, money, optStr, str, UserError, type ActionState } from "@/lib/form";

async function loadEditable(id: number) {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
  if (!tx) throw new UserError("Lançamento não encontrado.");
  if (tx.transferId) throw new UserError("Este lançamento faz parte de uma transferência. Altere em Entre empresas.");
  return tx;
}

export async function saveTransaction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const companyId = int(fd, "companyId");
    if (!companyId) throw new UserError("Empresa inválida.");
    const { user, company } = await requireCompanyId(companyId, "lancar");

    const id = int(fd, "id");
    let savedMsg = "Lançamento salvo.";
    const type = str(fd, "type");
    if (type !== "entrada" && type !== "saida") throw new UserError("Escolha entrada ou saída.");
    const description = str(fd, "description", 200);
    if (!description) throw new UserError("Informe a descrição.");
    const amount = money(fd, "amount");
    if (amount === null || amount <= 0) throw new UserError("Informe um valor maior que zero.");
    const dueDate = isoDate(fd, "dueDate");
    if (!dueDate) throw new UserError("Informe a data de vencimento.");
    // Data de pagamento preenchida = já pago; em branco = em aberto.
    const paidAt = isoDate(fd, "paidAt") ?? (fd.get("paid") === "on" ? today() : null);

    const accountId = int(fd, "accountId");
    const [account] = accountId
      ? await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.companyId, companyId)))
      : [];
    if (!account) throw new UserError("Escolha uma conta desta empresa.");

    // Área Pessoal: gasto pago (ou retirada recebida) com dinheiro de uma empresa vira "Retirada do sócio" lá.
    const withdrawalAccountId = company.ownerId ? int(fd, "withdrawalAccountId") : null;
    let bookAccount = account;
    if (withdrawalAccountId) {
      const [source] = await db
        .select({ acc: accounts, ownerId: companies.ownerId })
        .from(accounts)
        .innerJoin(companies, eq(companies.id, accounts.companyId))
        .where(eq(accounts.id, withdrawalAccountId));
      if (!source || source.ownerId || source.acc.viaCompany) throw new UserError("Escolha a conta da empresa de onde saiu o dinheiro.");
      await requireCompanyId(source.acc.companyId, "lancar");
      if (type === "saida") {
        // O gasto fica na conta técnica "Pago pelas empresas" (não mexe no saldo das suas contas pessoais).
        const [via] = await db.select().from(accounts).where(and(eq(accounts.companyId, companyId), eq(accounts.viaCompany, true)));
        if (!via) throw new UserError("Área pessoal sem a conta \"Pago pelas empresas\". Recarregue a página.");
        bookAccount = via;
      } else if (account.viaCompany) {
        throw new UserError("Escolha em qual conta pessoal o dinheiro entrou.");
      }
    } else if (account.viaCompany) {
      throw new UserError("Escolha de qual conta saiu o dinheiro.");
    }

    const categoryId = int(fd, "categoryId");
    if (categoryId) {
      const [cat] = await db
        .select()
        .from(categories)
        .where(and(eq(categories.id, categoryId), eq(categories.companyId, companyId)));
      if (!cat) throw new UserError("Categoria inválida.");
    }

    // Competência: mês informado ou, sem ele, o mês do vencimento.
    const competence = competenceOf(str(fd, "competence", 10)) ?? competenceOf(dueDate)!;
    // Nº do documento: vazio = automático; o formato A00000 é reservado à numeração do sistema.
    const typedDoc = str(fd, "document", 60);

    const values = {
      type: type as "entrada" | "saida",
      description,
      amount,
      dueDate,
      competence,
      paidAt,
      accountId: bookAccount.id,
      withdrawalAccountId: withdrawalAccountId ?? null,
      categoryId: categoryId ?? null,
      counterpart: null as string | null,
      personId: null as number | null,
      notes: optStr(fd, "notes", 1000),
    };
    // Cliente/fornecedor: usa o cadastro com esse nome ou cria na hora (só com o nome, com código C/F).
    const partyName = optStr(fd, "counterpart", 150);
    if (partyName) {
      const { person, created } = await findOrCreatePerson(companyId, personKindOf(values.type), { name: partyName }, user.id);
      if (created) await logChange({ user, companyId, action: "criar", entity: "pessoa", entityId: person.id, after: person });
      values.counterpart = person.name;
      values.personId = person.id;
    }

    if (id) {
      const before = await loadEditable(id);
      if (before.companyId !== companyId) throw new UserError("Lançamento não pertence a esta empresa.");
      if (before.source !== "manual") throw new UserError("Lançamentos importados do sistema de vendas não podem ser editados aqui.");
      if (SYSTEM_DOC.test(typedDoc.toUpperCase()) && typedDoc.toUpperCase() !== before.document) {
        throw new UserError("Números no formato A00000 são da numeração automática. Deixe em branco ou informe o nº da nota/pedido.");
      }
      const document = typedDoc ? (SYSTEM_DOC.test(typedDoc.toUpperCase()) ? typedDoc.toUpperCase() : typedDoc) : (before.document ?? (await nextDocument(companyId)));
      const [after] = await db
        .update(transactions)
        .set({ ...values, document, updatedAt: new Date() })
        .where(eq(transactions.id, id))
        .returning();
      await logChange({ user, companyId, action: "editar", entity: "lancamento", entityId: id, before, after });
      await syncWithdrawals([id], user);
      // "Esta e as próximas": leva valor, conta, categoria, fornecedor e o dia de vencimento para as ocorrências seguintes ainda em aberto.
      if (str(fd, "scope") === "proximas" && before.recurrenceGroup) {
        const group = before.recurrenceGroup;
        const series = await db
          .select({ id: transactions.id, dueDate: transactions.dueDate, competence: transactions.competence, paidAt: transactions.paidAt, originalAmount: transactions.originalAmount })
          .from(transactions)
          .where(and(eq(transactions.recurrenceGroup, group), isNull(transactions.deletedAt), isNull(transactions.partialOf)));
        const next = series.filter((t) => t.id !== id && t.dueDate >= before.dueDate && !t.paidAt && t.originalAmount === null);
        const moved = dueDate !== before.dueDate;
        const monthly = isMonthlySeries(series.map((t) => t.dueDate).concat(before.dueDate).filter((d, i, a) => a.indexOf(d) === i));
        const months = (Number(dueDate.slice(0, 4)) - Number(before.dueDate.slice(0, 4))) * 12 + Number(dueDate.slice(5, 7)) - Number(before.dueDate.slice(5, 7));
        await db.transaction(async (tx) => {
          for (const t of next) {
            const newDue = moved ? moveSeriesDate(t.dueDate, before.dueDate, dueDate, monthly) : t.dueDate;
            await tx
              .update(transactions)
              .set({
                amount: values.amount,
                accountId: values.accountId,
                withdrawalAccountId: values.withdrawalAccountId,
                categoryId: values.categoryId,
                counterpart: values.counterpart,
                personId: values.personId,
                description: values.description,
                dueDate: newDue,
                competence: moved && months !== 0 && t.competence ? addMonths(t.competence, months) : t.competence,
                updatedAt: new Date(),
              })
              .where(eq(transactions.id, t.id));
          }
          if (next.length) {
            await logChange(
              {
                user,
                companyId,
                action: "editar",
                entity: "lancamento",
                entityId: next.map((n) => n.id).join(","),
                after: { ...values, aplicadoAsProximas: next.length, vencimentoDe: moved ? before.dueDate : undefined },
              },
              tx,
            );
          }
        });
        await syncWithdrawals([id, ...next.map((n) => n.id)], user);
        revalidatePath("/", "layout");
        return {
          ok: `Lançamento atualizado, junto com ${next.length} ${next.length === 1 ? "ocorrência seguinte" : "ocorrências seguintes"}${moved && next.length ? ` (vencimentos ajustados)` : ""}.`,
        };
      }
    } else {
      const rawMode = str(fd, "mode");
      const mode: SeriesMode = rawMode === "mensal" || rawMode === "parcelada" ? rawMode : "unica";
      const openEnded = mode === "mensal" && str(fd, "months") === "sem_fim";
      const count =
        mode === "mensal"
          ? openEnded
            ? OPEN_ENDED_MONTHS
            : Math.min(Math.max(int(fd, "months") ?? 12, 2), 60)
          : mode === "parcelada"
            ? Math.min(Math.max(int(fd, "installments") ?? 2, 2), 72)
            : 1;
      const amountIsTotal = str(fd, "amountIs") !== "parcela";
      if (mode === "parcelada" && amountIsTotal && amount < count) throw new UserError("Valor pequeno demais para dividir nessas parcelas.");
      if (SYSTEM_DOC.test(typedDoc.toUpperCase())) {
        throw new UserError("Números no formato A00000 são da numeração automática. Deixe em branco ou informe o nº da nota/pedido.");
      }
      const document = typedDoc || (await nextDocument(companyId));
      // Intervalo: todo mês no mesmo dia (padrão) ou a cada N dias (15 em 15, semanal...). Conta fixa sem fim é sempre mensal.
      const everyDays = openEnded ? null : Math.min(Math.max(int(fd, "everyDays") ?? 0, 0), 365) || null;
      // Plano ajustado à mão (datas e valores de cada parcela) vale sobre o cálculo automático.
      const customJson = mode !== "unica" && !openEnded ? str(fd, "plan", 20_000) : "";
      let plan = planSeries({ mode, amount, dueDate, competence, count, amountIsTotal, openEnded, everyDays });
      if (customJson) {
        const custom = parsePlan(customJson);
        if ("error" in custom) throw new UserError(custom.error);
        plan = custom.map((c, i) => ({
          dueDate: c.dueDate,
          amount: c.amount,
          competence: shiftCompetence(competence, custom[0].dueDate, c.dueDate),
          installment: i + 1,
          installments: custom.length,
        }));
      }
      const group = plan.length > 1 ? randomUUID() : null;
      const rows = plan.map((p, i) => ({
        ...values,
        ...p,
        companyId,
        // Só a primeira ocorrência pode nascer paga; as próximas ficam pendentes.
        paidAt: i === 0 ? paidAt : null,
        recurrenceGroup: group,
        recurrence: group ? mode : null,
        openEnded,
        document,
        createdBy: user.id,
      }));
      const repeat = rows.length;
      savedMsg = `${description} · Doc ${document}${repeat > 1 ? ` · ${repeat} ${mode === "parcelada" ? "parcelas" : "meses"}` : ""}.`;
      const created = await db.insert(transactions).values(rows).returning();
      await syncWithdrawals(
        created.map((c) => c.id),
        user,
      );
      await logChange({
        user,
        companyId,
        action: "criar",
        entity: "lancamento",
        entityId: created.map((c) => c.id).join(","),
        after: repeat > 1 ? { ...created[0], ocorrencias: repeat } : created[0],
      });
    }
    revalidatePath("/", "layout");
    return { ok: id ? "Lançamento atualizado." : savedMsg };
  });
}

export async function setPaid(fd: FormData) {
  const id = int(fd, "id");
  if (!id) return;
  const [before] = await db.select().from(transactions).where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
  if (!before) return;
  const { user } = await requireCompanyId(before.companyId, "lancar");
  if (before.source !== "manual") return;
  const undo = fd.get("undo") === "1";
  if (undo && !before.transferId) {
    await undoSettlement(before, user);
    revalidatePath("/", "layout");
    return;
  }
  const paidAt = undo ? null : (isoDate(fd, "paidAt") ?? today());
  // Transferência: os dois lados mudam juntos.
  const where = before.transferId ? eq(transactions.transferId, before.transferId) : eq(transactions.id, id);
  if (before.transferId) {
    const sides = await db.select().from(transactions).where(where);
    for (const s of sides) await requireCompanyId(s.companyId, "lancar");
  }
  const after = await db.update(transactions).set({ paidAt, updatedAt: new Date() }).where(where).returning();
  await logChange({
    user,
    companyId: before.companyId,
    action: paidAt ? "baixar" : "estornar_baixa",
    entity: "lancamento",
    entityId: after.map((a) => a.id).join(","),
    before: { paidAt: before.paidAt },
    after: { paidAt },
  });
  await syncWithdrawals(
    after.map((a) => a.id),
    user,
  );
  revalidatePath("/", "layout");
}

type Tx = typeof transactions.$inferSelect;

/** Estorno: a conta volta a ficar em aberto com o valor original; um pagamento parcial devolve o valor à conta de origem. */
async function undoSettlement(before: Tx, user: { id: number; name: string }) {
  if (!before.paidAt) return;
  const principal = before.amount - before.interest + before.discount;
  await db.transaction(async (tx) => {
    if (before.partialOf) {
      const [parent] = await tx.select().from(transactions).where(eq(transactions.id, before.partialOf)).for("update");
      // Com a conta de origem já quitada, estorne primeiro o pagamento final.
      if (!parent || parent.paidAt || parent.deletedAt) return;
      const restored = parent.amount + principal;
      await tx
        .update(transactions)
        .set({ amount: restored, originalAmount: restored === parent.originalAmount ? null : parent.originalAmount, updatedAt: new Date() })
        .where(eq(transactions.id, parent.id));
      await tx.update(transactions).set({ deletedAt: new Date() }).where(eq(transactions.id, before.id));
      await logChange(
        { user, companyId: before.companyId, action: "estornar_baixa", entity: "lancamento", entityId: `${before.id},${parent.id}`, before, after: { contaDeOrigem: parent.id, valorEmAberto: restored } },
        tx,
      );
      return;
    }
    const [after] = await tx
      .update(transactions)
      .set({ paidAt: null, amount: principal, interest: 0, discount: 0, updatedAt: new Date() })
      .where(eq(transactions.id, before.id))
      .returning();
    await logChange({ user, companyId: before.companyId, action: "estornar_baixa", entity: "lancamento", entityId: before.id, before, after }, tx);
  });
  await syncWithdrawals([before.id, ...(before.partialOf ? [before.partialOf] : [])], user);
}

/**
 * Baixa de uma conta: data, valor pago, juros/desconto e de qual conta saiu (ou entrou).
 * Pagamento parcial vira um lançamento pago próprio e a conta de origem continua aberta com o restante.
 */
export async function settleTransaction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const id = int(fd, "id");
    if (!id) throw new UserError("Conta inválida.");
    const [current] = await db.select().from(transactions).where(and(eq(transactions.id, id), isNull(transactions.deletedAt)));
    if (!current) throw new UserError("Conta não encontrada.");
    const { user } = await requireCompanyId(current.companyId, "lancar");
    if (current.source !== "manual" || current.offBalance) throw new UserError("Contas do CHServer são baixadas lá; a sincronização atualiza aqui.");
    if (current.transferId) throw new UserError("Transferências são baixadas em Entre empresas.");
    if (current.paidAt) throw new UserError("Esta conta já foi baixada.");

    const paidAt = isoDate(fd, "paidAt") ?? today();
    const accountId = int(fd, "accountId");
    const [account] = accountId
      ? await db.select().from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.companyId, current.companyId)))
      : [];
    if (!account) throw new UserError("Escolha de qual conta saiu o dinheiro.");
    if (account.viaCompany && !current.withdrawalAccountId) throw new UserError("Escolha de qual conta saiu o dinheiro.");
    if (current.withdrawalAccountId && fd.get("partial") === "on") {
      throw new UserError("Gasto pago com dinheiro da empresa não aceita pagamento parcial. Ajuste o valor do lançamento ou pague o total.");
    }
    const interest = money(fd, "interest") ?? 0;
    const discount = money(fd, "discount") ?? 0;
    const paid = money(fd, "paid") ?? current.amount + interest - discount;

    const word = current.type === "entrada" ? "Recebimento" : "Pagamento";
    const done = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(transactions).where(eq(transactions.id, id)).for("update");
      if (!before || before.paidAt || before.deletedAt) throw new UserError("Esta conta mudou enquanto você preenchia. Recarregue a página.");
      const r = settle({ open: before.amount, paid, interest, discount, partial: fd.get("partial") === "on" });
      if ("error" in r) throw new UserError(r.error);
      if (r.kind === "total") {
        const [after] = await tx
          .update(transactions)
          .set({
            paidAt,
            amount: r.paid,
            interest: r.interest,
            discount: r.discount,
            accountId: account.id,
            // Pago de uma conta pessoal: deixa de ser retirada da empresa.
            withdrawalAccountId: account.viaCompany ? before.withdrawalAccountId : null,
            updatedAt: new Date(),
          })
          .where(eq(transactions.id, id))
          .returning();
        await logChange({ user, companyId: before.companyId, action: "baixar", entity: "lancamento", entityId: id, before, after }, tx);
        return `${word} registrado.`;
      }
      const [part] = await tx
        .insert(transactions)
        .values({
          companyId: before.companyId,
          accountId: account.id,
          type: before.type,
          description: before.description,
          categoryId: before.categoryId,
          counterpart: before.counterpart,
          personId: before.personId,
          amount: r.paid,
          interest: r.interest,
          discount: r.discount,
          dueDate: before.dueDate,
          paidAt,
          notes: before.notes,
          partialOf: before.id,
          document: before.document,
          installment: before.installment,
          installments: before.installments,
          competence: before.competence,
          createdBy: user.id,
        })
        .returning();
      const [after] = await tx
        .update(transactions)
        .set({ amount: r.remaining, originalAmount: before.originalAmount ?? before.amount, updatedAt: new Date() })
        .where(eq(transactions.id, id))
        .returning();
      await logChange(
        { user, companyId: before.companyId, action: "baixar_parcial", entity: "lancamento", entityId: `${part.id},${id}`, before, after: { pagamento: part, contaDeOrigem: after } },
        tx,
      );
      return `${word} parcial registrado. Ficam em aberto ${(r.remaining / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
    });
    revalidatePath("/", "layout");
    await syncWithdrawals([id], user);
    return { ok: done };
  });
}

/**
 * Exclui uma conta lançada por engano (fica marcada como excluída e registrada no log, não some do banco).
 * Em séries (fixa ou parcelada): só esta, esta e as próximas em aberto, ou todas as em aberto da série.
 * Parcelas já pagas da série não são tocadas; um pagamento parcial é estornado em vez de excluído.
 */
export async function removeTransaction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return guard(async () => {
    const id = int(fd, "id");
    if (!id) throw new UserError("Lançamento inválido.");
    const before = await loadEditable(id);
    const { user } = await requireCompanyId(before.companyId, "lancar");
    if (before.source !== "manual") throw new UserError("Esta conta veio do CHServer. Exclua lá; a próxima sincronização atualiza aqui.");
    // Excluir um pagamento parcial é o mesmo que estorná-lo: o valor volta para a conta em aberto.
    if (before.partialOf && before.paidAt) {
      await undoSettlement(before, user);
      revalidatePath("/", "layout");
      return { ok: "Pagamento parcial estornado: o valor voltou para a conta em aberto." };
    }
    const scope = str(fd, "scope");
    const group = before.recurrenceGroup;
    const series =
      group && (scope === "futuras" || scope === "todas")
        ? await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.recurrenceGroup, group), isNull(transactions.deletedAt), isNull(transactions.paidAt), isNull(transactions.partialOf)))
            .then((r) => r.filter((t) => t.id !== before.id && (scope === "todas" || t.dueDate >= before.dueDate)))
        : [];
    const rows = [before, ...series];
    const ids = rows.map((r) => r.id);
    // Conta com pagamento parcial registrado: estornar primeiro, para o dinheiro que já entrou/saiu não ficar solto.
    const [withPartial] = await db
      .select({ id: transactions.partialOf })
      .from(transactions)
      .where(and(inArray(transactions.partialOf, ids), isNull(transactions.deletedAt)))
      .limit(1);
    if (withPartial) {
      throw new UserError("Esta conta tem um pagamento parcial registrado. Estorne o pagamento parcial antes de excluir.");
    }
    await db.transaction(async (tx) => {
      await tx.update(transactions).set({ deletedAt: new Date() }).where(inArray(transactions.id, ids));
      // Conta fixa sem fim: excluir daqui para frente encerra a série (o sistema para de gerar os próximos meses).
      if (group && before.openEnded && (scope === "futuras" || scope === "todas")) {
        await tx.update(transactions).set({ openEnded: false }).where(eq(transactions.recurrenceGroup, group));
      }
      await logChange(
        {
          user,
          companyId: before.companyId,
          action: "excluir",
          entity: "lancamento",
          entityId: ids.join(","),
          before: rows.length === 1 ? before : { ...before, ocorrencias: rows.length, escopo: scope },
        },
        tx,
      );
    });
    await syncWithdrawals(ids, user);
    revalidatePath("/", "layout");
    // Da tela de edição a conta deixa de existir: volta para a lista (só caminhos internos).
    const back = str(fd, "redirectTo", 200);
    if (/^\/empresa\/[a-z0-9-]+\/(pagar|receber|lancamentos)$/.test(back)) redirect(back);
    return { ok: rows.length === 1 ? "Conta excluída." : `${rows.length} contas excluídas.` };
  });
}
