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
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin, type AdminContext } from "@/lib/auth/admin-guard"

const patchSchema = z.object({
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD")
    .optional(),
  value: z.number().positive().max(100000).optional(),
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
 */
async function assertPaymentInScope(
  ctx: AdminContext,
  tenantId: string,
  paymentId: string,
): Promise<Response | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { accountManagerId: true, salesUserId: true },
  })
  if (!(await ctx.canAccessTenant(tenant))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const payment = await prisma.tenantPayment.findFirst({
    where: { asaasPaymentId: paymentId, tenantId },
    select: { id: true },
  })
  if (!payment) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
  }
  return null
}

export const PATCH = withRequestContextParams<{ id: string; paymentId: string }>(
  { action: "admin.revendedores.payments.update", route: "/api/admin/revendedores/[id]/payments/[paymentId]" },
  async (request: Request, ctx) => {
  const guard = await requireAdmin("unidades.billing")
  if (!guard.ok) return guard.response

  const { id: tenantId, paymentId } = await ctx.params
  const denied = await assertPaymentInScope(guard.ctx, tenantId, paymentId)
  if (denied) return denied

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

  // Valida que o pagamento está pendente antes de editar
  try {
    const payment = await getPayment(paymentId)
    if (payment.status !== "PENDING" && payment.status !== "OVERDUE") {
      return NextResponse.json(
        { error: "Só é possível editar cobranças pendentes ou vencidas" },
        { status: 400 },
      )
    }
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) {
      return NextResponse.json({ error: "Cobrança não encontrada no Asaas" }, { status: 404 })
    }
    return NextResponse.json({ error: "Erro ao verificar cobrança" }, { status: 502 })
  }

  // Atualiza no Asaas
  try {
    await updatePayment(paymentId, {
      ...(parsed.data.dueDate ? { dueDate: parsed.data.dueDate } : {}),
      ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
    })
  } catch (error) {
    const message =
      error instanceof AsaasApiError ? error.message : "Falha ao atualizar cobrança no Asaas"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  // Sincroniza no banco (best-effort)
  await prisma.tenantPayment
    .updateMany({
      where: { asaasPaymentId: paymentId, tenantId },
      data: {
        ...(parsed.data.dueDate ? { dueDate: new Date(parsed.data.dueDate) } : {}),
        ...(parsed.data.value !== undefined ? { amount: parsed.data.value } : {}),
      },
    })
    .catch(swallow("admin.revendedores.payments"))

  return NextResponse.json({ data: { ok: true } })
  },
)

export const DELETE = withRequestContextParams<{ id: string; paymentId: string }>(
  { action: "admin.revendedores.payments.delete", route: "/api/admin/revendedores/[id]/payments/[paymentId]" },
  async (_request: Request, ctx) => {
  const guard = await requireAdmin("unidades.billing")
  if (!guard.ok) return guard.response

  const { id: tenantId, paymentId } = await ctx.params
  const denied = await assertPaymentInScope(guard.ctx, tenantId, paymentId)
  if (denied) return denied

  try {
    await deletePayment(paymentId)
  } catch (error) {
    // 404 = a cobrança já não existe no Asaas (cancelada por fora, ou
    // assinatura recriada). Não é erro: seguimos para sincronizar o banco e
    // tirar o registro órfão do painel. Demais erros impedem a sincronização.
    if (!(error instanceof AsaasApiError && error.statusCode === 404)) {
      const message =
        error instanceof AsaasApiError ? error.message : "Falha ao cancelar cobrança no Asaas"
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }

  // Estado intermediário: a cobrança foi mandada apagar no Asaas, mas a
  // confirmação real vem pelo webhook PAYMENT_DELETED (que valida o 404 da
  // cobrança e marca DELETED). Até lá o painel mostra "Apagando cobrança…".
  // A reconciliação do GET do detalhe é o fallback caso o webhook não chegue.
  await prisma.tenantPayment
    .updateMany({
      where: { asaasPaymentId: paymentId, tenantId },
      data: { status: "DELETING" },
    })
    .catch(swallow("admin.revendedores.payments"))

  return NextResponse.json({ data: { ok: true } })
  },
)
