import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { markPayoutPaid } from "@/lib/referrals/payout"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"

const bodySchema = z.object({
  asaasTransferId: z.string().min(1).max(80).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  // Valor efetivamente pago. Permite ao financeiro confirmar ou ajustar o
  // valor da recorrencia antes de dar ok. Ausente = mantem o valor atual.
  amount: z.number().positive().max(1_000_000).optional(),
})

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

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
  { action: "admin.financeiro.referral_payouts.mark_paid", route: "/api/admin/financeiro/referral-payouts/[id]/mark-paid" },
  async (request: Request, context) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

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

  const payout = await prisma.referralPayout.findUnique({
    where: { id },
    select: { id: true, status: true, notes: true, amount: true },
  })
  if (!payout) {
    return NextResponse.json(
      { error: "Saque não encontrado" },
      { status: 404 },
    )
  }
  if (payout.status === "PAID") {
    return NextResponse.json({ error: "Saque já está pago" }, { status: 409 })
  }

  const currentAmount = Number(payout.amount)
  const newAmount = parsed.data.amount
  const amountChanged =
    typeof newAmount === "number" &&
    Math.abs(newAmount - currentAmount) > 0.001

  const adminName = session.name ?? session.email ?? "Admin"
  const noteText = parsed.data.note?.trim()
  const adjustmentNote = amountChanged
    ? ` Valor ajustado de ${formatBRL(currentAmount)} para ${formatBRL(newAmount!)}.`
    : ""
  const baseNote = `Marcado como pago manualmente.${adjustmentNote}${noteText ? ` ${noteText}` : ""}`
  const nextNotes = appendNote(payout.notes, baseNote, adminName)

  try {
    // Ajusta o valor do payout ANTES de marcar como pago, para que a
    // notificacao ao revendedor e as comissoes liquidadas reflitam o valor
    // efetivamente pago.
    if (amountChanged) {
      await prisma.referralPayout.update({
        where: { id: payout.id },
        data: { amount: new Prisma.Decimal(newAmount!) },
      })
    }

    const updated = await markPayoutPaid(
      payout.id,
      parsed.data.asaasTransferId?.trim() || null,
    )

    await prisma.referralPayout.update({
      where: { id: payout.id },
      data: {
        markedPaidById: session.userId,
        notes: nextNotes,
      },
    })

    await logAudit({
      action: "payout.mark_paid",
      resource: "ReferralPayout",
      resourceId: payout.id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      payloadBefore: { status: payout.status, amount: currentAmount },
      payloadAfter: {
        status: updated.status,
        amount: Number(updated.amount),
        amountAdjusted: amountChanged,
        asaasTransferId: parsed.data.asaasTransferId ?? null,
      },
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        status: updated.status,
        amount: Number(updated.amount),
      },
    })
  } catch (err) {
    contextLogger().error(
      {
        err,
        event: "admin.financeiro.mark_paid_failed",
        payoutId: id,
        prismaError: err instanceof Prisma.PrismaClientKnownRequestError,
      },
      "mark-paid payout falhou",
    )
    const message = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
  },
)
