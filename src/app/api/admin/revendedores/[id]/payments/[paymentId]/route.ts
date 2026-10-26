import { NextResponse } from "next/server"
import { z } from "zod"
import {
  deletePayment,
  updatePayment,
  getPayment,
  AsaasApiError,
} from "@/lib/asaas/client"
import { prisma } from "@/lib/prisma"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin, type AdminContext } from "@/lib/auth/admin-guard"
import { logAudit } from "@/lib/audit"
import { resolveTenantPayment } from "@/lib/tenant-billing/resolve-payment"
import { appendNote } from "@/lib/tenant-billing/change-log"
import {
  loadTenantLifecycle,
  assertCortesiaExcepcional,
  isDueDateStretched,
  CORTESIA_AUDIT,
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH,
  type CortesiaTrigger,
} from "@/lib/tenants/lifecycle"

const patchSchema = z.object({
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD")
    .optional(),
  value: z.number().positive().max(100000).optional(),
  // Justificativa da cortesia excepcional (ver `lib/tenants/lifecycle.ts`).
  reason: z.string().trim().min(MIN_REASON_LENGTH).max(MAX_REASON_LENGTH).optional(),
})

/**
 * Prova que a cobrança pertence à unidade da URL E que a unidade está no escopo
 * de quem chamou.
 *
 * Sem isto, o handler agia só sobre `paymentId` — e como `deletePayment` bate na
 * chave Asaas da MÃE, qualquer pessoa com `unidades.billing` cancelava (ou, no
 * PATCH, reprecificava) a mensalidade de uma unidade fora da carteira dela,
 * passando um `paymentId` arbitrário. O `tenantId` só entrava no `updateMany`
 * local, que silenciosamente não casava nada.
 *
 * A prova de posse tem DUAS fontes, porque a tela também tem duas: o detalhe da
 * unidade lista `[...vindas do Asaas, ...vindas do banco]`. Uma cobrança cujo
 * webhook `PAYMENT_CREATED` não chegou aparece na tela sem linha em
 * `TenantPayment` — exigir a linha local negava o cancelamento de uma cobrança
 * real e viva, que é justamente a que o admin precisa cancelar. Quando não há
 * espelho local, perguntamos ao Asaas de quem é a cobrança e comparamos com o
 * `asaasCustomerId` da unidade.
 */
async function assertPaymentInScope(
  ctx: AdminContext,
  tenantId: string,
  paymentId: string,
): Promise<{ response: Response } | { asaasPaymentId: string; localId: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      accountManagerId: true,
      salesUserId: true,
      asaasCustomerId: true,
      asaasSubscriptionId: true,
    },
  })
  if (!tenant || !(await ctx.canAccessTenant(tenant))) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }

  try {
    // Sem espelho local, le as cobrancas da unidade no Asaas e cria o vinculo.
    // A reconciliacao so importa cobranca do cliente Asaas DESTA unidade: um
    // `pay_` de outra unidade continua sem linha e responde 404 — nao revela
    // que a cobranca existe em outro lugar.
    const found = await resolveTenantPayment(tenant, paymentId)
    if (!found) {
      return {
        response: NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 }),
      }
    }
    return { asaasPaymentId: found.asaasPaymentId, localId: found.id }
  } catch (error) {
    contextLogger().error(
      { event: "payment.scope_check_failed", tenantId, paymentId, err: error },
      "falha ao confirmar a posse da cobrança no Asaas",
    )
    // Indisponibilidade do Asaas NÃO pode virar autorização.
    return {
      response: NextResponse.json(
        { error: "Não foi possível confirmar a cobrança no Asaas. Tente novamente." },
        { status: 503 },
      ),
    }
  }
}

export const PATCH = withRequestContextParams<{ id: string; paymentId: string }>(
  { action: "admin.revendedores.payments.update", route: "/api/admin/revendedores/[id]/payments/[paymentId]" },
  async (request: Request, ctx) => {
  const guard = await requireAdmin("unidades.billing")
  if (!guard.ok) return guard.response

  const { id: tenantId, paymentId: rawId } = await ctx.params
  const scope = await assertPaymentInScope(guard.ctx, tenantId, rawId)
  if ("response" in scope) return scope.response
  // A tela pode mandar o id do banco ou o do Asaas; daqui em diante, o do Asaas.
  const paymentId = scope.asaasPaymentId

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  if (!parsed.data.dueDate && parsed.data.value === undefined) {
    return NextResponse.json(
      { error: "Informe ao menos dueDate ou value" },
      { status: 400 },
    )
  }

  // Valida que o pagamento está pendente antes de editar. Precisa vir ANTES do
  // gate: é daqui que sai o valor atual com que a redução é comparada.
  let valorAtual: number | null = null
  try {
    const payment = await getPayment(paymentId)
    if (payment.status !== "PENDING" && payment.status !== "OVERDUE") {
      return NextResponse.json(
        { error: "Só é possível editar cobranças pendentes ou vencidas" },
        { status: 400 },
      )
    }
    valorAtual = typeof payment.value === "number" ? payment.value : null
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada no Asaas" }, { status: 404 })
    }
    return NextResponse.json({ error: "Erro ao verificar cobrança" }, { status: 502 })
  }

  // Cortesia excepcional. Esta rota edita a MESMA cobrança cujo não-pagamento
  // define a trava, uma a uma em vez de pela assinatura — e os DOIS campos são
  // caminhos de fuga:
  //   - `dueDate`: esticar o prazo pela porta dos fundos;
  //   - `value`: reprecificar para R$ 0,01 faz a unidade "pagar", o webhook
  //     grava um TenantPayment RECEIVED e ela sai da trava PARA SEMPRE, porque
  //     `everPaid` é irreversível de propósito.
  const lifecycle = await loadTenantLifecycle(tenantId)
  const reduzValor =
    parsed.data.value !== undefined &&
    valorAtual !== null &&
    parsed.data.value < valorAtual
  const cortesiaTrigger: CortesiaTrigger | null =
    parsed.data.dueDate &&
    lifecycle &&
    isDueDateStretched(parsed.data.dueDate, lifecycle.createdAt)
      ? "postpone"
      : reduzValor
        ? "discount"
        : null

  let cortesiaConcedida: string | undefined
  if (cortesiaTrigger) {
    const verdict = assertCortesiaExcepcional({
      tenant: {
        everPaid: lifecycle?.everPaid ?? true,
        neverActivated: lifecycle?.neverActivated ?? false,
      },
      trigger: cortesiaTrigger,
      override: {
        allowed: guard.ctx.can("unidades.cortesiaExcepcional"),
        reason: parsed.data.reason,
      },
    })

    const payload = {
      trigger: cortesiaTrigger,
      paymentId,
      dueDate: parsed.data.dueDate,
      value: parsed.data.value,
      valueAnterior: valorAtual,
    }

    if (verdict.blocked) {
      await logAudit({
        action: CORTESIA_AUDIT.blocked,
        resource: "Tenant",
        resourceId: tenantId,
        actorUserId: guard.ctx.userId,
        actorRole: guard.ctx.role,
        actorEmail: guard.ctx.email,
        tenantId,
        payloadAfter: payload,
      })
      return NextResponse.json(
        { error: verdict.message, requiresReason: verdict.requiresReason },
        { status: 403 },
      )
    }
    if (verdict.overridden) cortesiaConcedida = verdict.reason
  }

  // Banco e historico ANTES do Asaas, desfeitos se ele recusar: um espelho
  // rodando entre as duas escritas registraria a edicao como feita "direto no
  // Asaas".
  const autor = guard.ctx.name ?? guard.ctx.email ?? "Admin"
  const antes = await prisma.tenantPayment.findUnique({
    where: { id: scope.localId },
    select: { amount: true, dueDate: true, notes: true },
  })
  const mudancas = [
    parsed.data.dueDate && antes
      ? `vencimento ${antes.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })} → ${new Date(`${parsed.data.dueDate}T00:00:00.000Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`
      : null,
    parsed.data.value !== undefined && antes
      ? `valor R$ ${Number(antes.amount).toFixed(2).replace(".", ",")} → R$ ${parsed.data.value.toFixed(2).replace(".", ",")}`
      : null,
  ].filter(Boolean)
  await prisma.tenantPayment.update({
    where: { id: scope.localId },
    data: {
      ...(parsed.data.dueDate ? { dueDate: new Date(`${parsed.data.dueDate}T00:00:00.000Z`) } : {}),
      ...(parsed.data.value !== undefined ? { amount: parsed.data.value } : {}),
      notes: appendNote(antes?.notes ?? null, `Editada no PMB por ${autor}: ${mudancas.join("; ")}.`),
    },
  })

  try {
    await updatePayment(paymentId, {
      ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}),
      ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
    })
  } catch (error) {
    if (antes) {
      await prisma.tenantPayment
        .update({ where: { id: scope.localId }, data: antes })
        .catch(swallow("admin.revendedores.payments"))
    }
    const message =
      error instanceof AsaasApiError ? error.message : "Falha ao atualizar cobrança no Asaas"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  // Auditada só depois de o Asaas aceitar — antes disso a cortesia não existiu.
  if (cortesiaConcedida) {
    await logAudit({
      action: CORTESIA_AUDIT.granted,
      resource: "Tenant",
      resourceId: tenantId,
      actorUserId: guard.ctx.userId,
      actorRole: guard.ctx.role,
      actorEmail: guard.ctx.email,
      tenantId,
      payloadAfter: {
        trigger: cortesiaTrigger,
        paymentId,
        dueDate: parsed.data.dueDate,
        value: parsed.data.value,
        valueAnterior: valorAtual,
        reason: cortesiaConcedida,
      },
    })
  }

  return NextResponse.json({ data: { ok: true } })
  },
)

export const DELETE = withRequestContextParams<{ id: string; paymentId: string }>(
  { action: "admin.revendedores.payments.delete", route: "/api/admin/revendedores/[id]/payments/[paymentId]" },
  async (_request: Request, ctx) => {
  const guard = await requireAdmin("unidades.billing")
  if (!guard.ok) return guard.response

  const { id: tenantId, paymentId: rawId } = await ctx.params
  const scope = await assertPaymentInScope(guard.ctx, tenantId, rawId)
  if ("response" in scope) return scope.response
  // A tela pode mandar o id do banco ou o do Asaas; daqui em diante, o do Asaas.
  const paymentId = scope.asaasPaymentId

  // DELETING + historico ANTES de apagar no Asaas: o webhook PAYMENT_DELETED
  // pode chegar antes desta rota terminar, e sem a marca registraria
  // "cancelada direto no Asaas". A linha nunca e apagada — a fatura cancelada
  // segue no historico (o webhook confirma DELETED; a reconciliacao do GET e o
  // fallback).
  const autor = guard.ctx.name ?? guard.ctx.email ?? "Admin"
  const antes = await prisma.tenantPayment.findUnique({
    where: { id: scope.localId },
    select: { status: true, notes: true },
  })
  await prisma.tenantPayment.update({
    where: { id: scope.localId },
    data: {
      status: "DELETING",
      notes: appendNote(antes?.notes ?? null, `Cancelada no PMB por ${autor}.`),
    },
  })

  try {
    await deletePayment(paymentId)
  } catch (error) {
    // 404 = a cobrança já não existe no Asaas (cancelada por fora, ou
    // assinatura recriada). Não é erro: o estado desejado. Demais erros: a
    // cobrança segue viva, e a linha volta ao que era.
    if (!(error instanceof AsaasApiError && error.statusCode === 404)) {
      if (antes) {
        await prisma.tenantPayment
          .update({ where: { id: scope.localId }, data: antes })
          .catch(swallow("admin.revendedores.payments"))
      }
      const message =
        error instanceof AsaasApiError ? error.message : "Falha ao cancelar cobrança no Asaas"
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  return NextResponse.json({ data: { ok: true } })
  },
)
