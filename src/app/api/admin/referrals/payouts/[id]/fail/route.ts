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
  { action: "admin.referrals.payouts.fail", route: "/api/admin/referrals/payouts/[id]/fail" },
  async (request: Request, context) => {
  const guard = await requireAdmin("indicacoes.saques")
  if (!guard.ok) return guard.response
  const session = guard.ctx
  const { id } = await context.params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados invalidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const payout = await prisma.referralPayout.findUnique({
    where: { id },
    select: { id: true, status: true, referrerTenantId: true },
  })
  if (!payout) {
    return NextResponse.json({ error: "Saque nao encontrado" }, { status: 404 })
  }
  if (payout.status === "PAID" || payout.status === "FAILED") {
    return NextResponse.json(
      { error: `Saque ja esta em estado ${payout.status}` },
      { status: 409 },
    )
  }

  // Recorte da carteira: quem não tem visão financeira do ecossistema só
  // decide sobre saques das unidades que enxerga — no formato do próprio papel
  // (accountManagerId, salesUserId ou time), não só accountManagerId.
  const scope = await session.comissoesScope()
  if (!scope) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
  }
  if (Object.keys(scope).length > 0) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: payout.referrerTenantId, ...scope },
      select: { id: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
    }
  }

  try {
    const updated = await failPayout(id, parsed.data.reason)
    return NextResponse.json({
      data: { id: updated.id, status: updated.status },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno"
    contextLogger().error(
      { err, event: "admin.referrals.fail_failed", payoutId: id },
      "failPayout falhou",
    )
    return NextResponse.json({ error: message }, { status: 500 })
  }
  },
)
