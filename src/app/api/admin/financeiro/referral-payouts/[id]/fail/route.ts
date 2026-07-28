import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { failPayout } from "@/lib/referrals/payout"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z.object({
  reason: z.string().min(3).max(500),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.financeiro.referral_payouts.fail", route: "/api/admin/financeiro/referral-payouts/[id]/fail" },
  async (request: Request, context) => {
  const guard = await requireAdmin("financeiro.manage")
  if (!guard.ok) return guard.response
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

  const payout = await prisma.referralPayout.findUnique({
    where: { id },
    select: { id: true, status: true },
  })
  if (!payout) {
    return NextResponse.json({ error: "Saque não encontrado" }, { status: 404 })
  }
  if (payout.status === "PAID" || payout.status === "FAILED") {
    return NextResponse.json(
      { error: `Saque já está em estado ${payout.status}` },
      { status: 409 },
    )
  }

  try {
    const updated = await failPayout(id, parsed.data.reason.trim())
    return NextResponse.json({
      data: { id: updated.id, status: updated.status },
    })
  } catch (err) {
    contextLogger().error(
      { err, event: "admin.financeiro.fail_payout_failed", payoutId: id },
      "fail payout falhou",
    )
    const message = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
  },
)
