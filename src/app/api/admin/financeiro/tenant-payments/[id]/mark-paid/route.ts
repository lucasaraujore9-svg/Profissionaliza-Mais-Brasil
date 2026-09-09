import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { resolverCompetencia } from "@/lib/asaas/competencia"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { logAudit } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"
import { loadTenantLifecycle, CORTESIA_AUDIT } from "@/lib/tenants/lifecycle"

const bodySchema = z.object({
  paidAt: z.string().optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
})

function appendNote(
  existing: string | null,
  note: string,
  adminName: string,
): string {
  const ts = new Date().toLocaleString("pt-BR")
  const entry = `[${ts}] ${adminName}: ${note}`
  return existing && existing.trim().length > 0
    ? `${existing}\n---\n${entry}`
    : entry
}

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.financeiro.tenant_payments.mark_paid", route: "/api/admin/financeiro/tenant-payments/[id]/mark-paid" },
  async (request: Request, context) => {
  const guard = await requireAdmin("financeiro.manage")
  if (!guard.ok) return guard.response
  const session = guard.ctx
  const { id } = await context.params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const payment = await prisma.tenantPayment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      notes: true,
      amount: true,
      // Vencimento: metade da regra de competencia (`max(vencimento, pagamento)`).
      dueDate: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
  })
  if (!payment) {
    return NextResponse.json(
      { error: "Pagamento não encontrado" },
      { status: 404 },
    )
  }
  if (payment.status === "RECEIVED" || payment.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "Pagamento já está marcado como recebido" },
      { status: 409 },
    )
  }

  // Baixa manual numa unidade que está fora do ar e nunca pagou TIRA ela da
  // regra de cortesia excepcional sem dinheiro nenhum passar por gateway — e o
  // cron `reactivate-paid` ainda a devolve ao ar sozinho em até 48h.
  //
  // Não bloqueamos: registrar PIX/espécie recebido fora do Asaas é justamente o
  // caminho legítimo de a unidade sair da situação, e travá-lo atrás do super
  // admin emperraria o financeiro. Mas isto não pode acontecer calado.
  const lifecycle = await loadTenantLifecycle(payment.tenantId)
  const saiDaBlacklist = lifecycle?.neverActivated ?? false

  const now = new Date()
  let paidAt = now
  if (parsed.data.paidAt) {
    const d = new Date(parsed.data.paidAt)
    if (!Number.isNaN(d.getTime())) paidAt = d
  }

  const adminName = session.name ?? session.email ?? "Admin"
  const noteText = parsed.data.note?.trim()
  const baseNote = `Marcado como pago manualmente.${noteText ? ` ${noteText}` : ""}`
  const nextNotes = appendNote(payment.notes, baseNote, adminName)

  const updated = await prisma.tenantPayment.update({
    where: { id },
    data: {
      status: "RECEIVED",
      paidAt,
      // Baixa manual (PIX por fora) tambem precisa de COMPETENCIA, senao a
      // mensalidade nunca entra na comissao de indicacao — o motor varre por
      // `competenceAt`, nao por `paidAt`. Aqui nao ha data de cliente do
      // gateway: quem pagou informou a data, e ela e a data do pagamento.
      clientPaidAt: paidAt,
      competenceAt: resolverCompetencia(payment.dueDate, paidAt),
      markedPaidAt: now,
      markedPaidById: session.userId,
      notes: nextNotes,
    },
    select: { id: true, status: true, paidAt: true, markedPaidAt: true },
  })

  if (saiDaBlacklist) {
    const unidade = payment.tenant?.name ?? payment.tenantId
    const valor = Number(payment.amount).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })
    await logAudit({
      action: CORTESIA_AUDIT.laundered,
      resource: "TenantPayment",
      resourceId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      tenantId: payment.tenantId,
      payloadBefore: { status: payment.status, tenantStatus: lifecycle?.status },
      payloadAfter: { status: "RECEIVED", markedPaidAt: now.toISOString(), amount: Number(payment.amount) },
    })
    await createNotification({
      audience: "ROLE",
      roleTarget: "SUPER_ADMIN",
      level: "WARNING",
      title: "Baixa manual em unidade que nunca pagou",
      body: `${adminName} marcou como paga a mensalidade de ${valor} da unidade ${unidade}, que está ${lifecycle?.status === "CANCELLED" ? "cancelada" : "suspensa"} e nunca teve nenhuma mensalidade paga. Isso a tira da trava de cortesia excepcional e o cron de reativação pode devolvê-la ao ar em até 48h.`,
      // Sem `category` de propósito: este é o ÚNICO sinal de que a trava foi
      // contornada, e categoria pode ser desligada em /admin/configuracoes ou
      // por preferência de quem recebe. Mesmo padrão do alerta de parcelamento
      // não confirmado em `cobranca/[paymentId]/pay-card`.
      href: `/admin/revendedores/${payment.tenantId}`,
    }).catch(swallow("financeiro.mark_paid.notify"))
  }

  return NextResponse.json({
    data: {
      id: updated.id,
      status: updated.status,
      paidAt: updated.paidAt?.toISOString() ?? null,
      markedPaidAt: updated.markedPaidAt?.toISOString() ?? null,
    },
  })
  },
)
