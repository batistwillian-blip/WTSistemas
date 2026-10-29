"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { requireCompanyId } from "@/lib/access";
import { logChange } from "@/lib/audit";
import { competenceOf, planSeries, settle, OPEN_ENDED_MONTHS, SYSTEM_DOC, type SeriesMode } from "@/lib/billing";
import { nextDocument } from "@/lib/documents";
import { today } from "@/lib/format";
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
    const { user } = await requireCompanyId(companyId, "lancar");

    const id = int(fd, "id");
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
      accountId: account.id,
      categoryId: categoryId ?? null,
      counterpart: optStr(fd, "counterpart", 150),
      notes: optStr(fd, "notes", 1000),
    };

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
      // "Esta e as próximas": leva valor, conta, categoria e fornecedor para as ocorrências seguintes ainda em aberto.
      if (str(fd, "scope") === "proximas" && before.recurrenceGroup) {
        const next = await db
          .update(transactions)
          .set({
            amount: values.amount,
            accountId: values.accountId,
            categoryId: values.categoryId,
            counterpart: values.counterpart,
            // Na parcelada cada uma tem o seu "(k/N)"; na fixa a descrição acompanha.
            description: values.description,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(transactions.recurrenceGroup, before.recurrenceGroup),
              gte(transactions.dueDate, before.dueDate),
              isNull(transactions.paidAt),
              isNull(transactions.deletedAt),
              isNull(transactions.originalAmount),
              sql`${transactions.id} <> ${id}`,
            ),
          )
          .returning({ id: transactions.id });
        if (next.length) {
          await logChange({ user, companyId, action: "editar", entity: "lancamento", entityId: next.map((n) => n.id).join(","), after: { ...values, aplicadoAsProximas: next.length } });
        }
        revalidatePath("/", "layout");
        return { ok: `Lançamento atualizado, junto com ${next.length} ${next.length === 1 ? "ocorrência seguinte" : "ocorrências seguintes"}.` };
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
      const plan = planSeries({ mode, amount, dueDate, competence, count, amountIsTotal, openEnded });
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
      const created = await db.insert(transactions).values(rows).returning();
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
    return { ok: id ? "Lançamento atualizado." : "Lançamento salvo." };
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
          .set({ paidAt, amount: r.paid, interest: r.interest, discount: r.discount, accountId: account.id, updatedAt: new Date() })
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
    return { ok: done };
  });
}

export async function deleteTransaction(fd: FormData) {
  const id = int(fd, "id");
  if (!id) return;
  const before = await loadEditable(id);
  const { user } = await requireCompanyId(before.companyId, "gerir");
  if (before.source !== "manual") return;
  // Excluir um pagamento parcial é o mesmo que estorná-lo: o valor volta para a conta em aberto.
  if (before.partialOf && before.paidAt) {
    await undoSettlement(before, user);
    revalidatePath("/", "layout");
    return;
  }
  const scope = str(fd, "scope");
  // "futuras" exclui esta e as próximas ocorrências pendentes da mesma recorrência.
  const rows =
    scope === "futuras" && before.recurrenceGroup
      ? await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.recurrenceGroup, before.recurrenceGroup), isNull(transactions.deletedAt), isNull(transactions.paidAt)))
          .then((r) => r.filter((t) => t.dueDate >= before.dueDate))
      : [before];
  const now = new Date();
  for (const r of rows) {
    await db.update(transactions).set({ deletedAt: now }).where(eq(transactions.id, r.id));
  }
  // Encerrar uma conta fixa sem fim: para de gerar os próximos meses.
  if (scope === "futuras" && before.recurrenceGroup && before.openEnded) {
    await db.update(transactions).set({ openEnded: false }).where(eq(transactions.recurrenceGroup, before.recurrenceGroup));
  }
  await logChange({
    user,
    companyId: before.companyId,
    action: "excluir",
    entity: "lancamento",
    entityId: rows.map((r) => r.id).join(","),
    before: rows.length === 1 ? before : { ...before, ocorrencias: rows.length },
  });
  revalidatePath("/", "layout");
}
