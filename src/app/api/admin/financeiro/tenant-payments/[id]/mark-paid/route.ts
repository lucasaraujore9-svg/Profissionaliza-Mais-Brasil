import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { canMarkPaid } from "@/lib/auth/roles"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

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
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (!canMarkPaid(session.role)) {
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

  const payment = await prisma.tenantPayment.findUnique({
    where: { id },
    select: { id: true, status: true, notes: true },
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
      markedPaidAt: now,
      markedPaidById: session.userId,
      notes: nextNotes,
    },
    select: { id: true, status: true, paidAt: true, markedPaidAt: true },
  })

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
