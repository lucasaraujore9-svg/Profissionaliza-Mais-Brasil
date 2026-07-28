import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  note: z.string().min(1).max(2000),
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
  { action: "admin.financeiro.tenant_payments.note", route: "/api/admin/financeiro/tenant-payments/[id]/note" },
  async (request: Request, context) => {
  const guard = await requireAdmin("financeiro.manage")
  if (!guard.ok) return guard.response
  const session = guard.ctx
  const { id } = await context.params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
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
    select: { id: true, notes: true },
  })
  if (!payment) {
    return NextResponse.json(
      { error: "Pagamento não encontrado" },
      { status: 404 },
    )
  }

  const adminName = session.name ?? session.email ?? "Admin"
  const nextNotes = appendNote(payment.notes, parsed.data.note.trim(), adminName)

  const updated = await prisma.tenantPayment.update({
    where: { id },
    data: { notes: nextNotes },
    select: { id: true, notes: true },
  })

  return NextResponse.json({
    data: { id: updated.id, notes: updated.notes },
  })
  },
)
