import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { payoutScopeWhere } from "@/lib/referrals/payout-scope"

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
  { action: "admin.financeiro.referral_payouts.note", route: "/api/admin/financeiro/referral-payouts/[id]/note" },
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

  // `financeiro.manage` autoriza a acao; o recorte abaixo amarra o saque
  // a carteira de quem chamou — sem ele, o id na URL alcancava a rede.
  const scopeWhere = await payoutScopeWhere(guard.ctx, id)
  if (!scopeWhere) {
    return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
  }
  const payout = await prisma.referralPayout.findFirst({
    where: scopeWhere,
    select: { id: true, notes: true },
  })
  if (!payout) {
    return NextResponse.json({ error: "Saque não encontrado" }, { status: 404 })
  }

  const adminName = session.name ?? session.email ?? "Admin"
  const nextNotes = appendNote(payout.notes, parsed.data.note.trim(), adminName)

  const updated = await prisma.referralPayout.update({
    where: { id },
    data: { notes: nextNotes },
    select: { id: true, notes: true },
  })

  return NextResponse.json({
    data: { id: updated.id, notes: updated.notes },
  })
  },
)
