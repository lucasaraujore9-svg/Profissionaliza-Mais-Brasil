import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { markPayoutPaid } from "@/lib/referrals/payout"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const bodySchema = z.object({
  asaasTransferId: z.string().min(1).max(80).optional().nullable(),
})

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.referrals.payouts.approve", route: "/api/admin/referrals/payouts/[id]/approve" },
  async (request: Request, context) => {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
  }
  if (
    session.role !== "SUPER_ADMIN" &&
    session.role !== "PMB_RESELLER_MGR"
  ) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
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
    return NextResponse.json({ error: "Dados invalidos" }, { status: 400 })
  }

  const payout = await prisma.referralPayout.findUnique({
    where: { id },
    select: { id: true, status: true, method: true, referrerTenantId: true, amount: true, proofUrl: true },
  })
  if (!payout) {
    return NextResponse.json({ error: "Saque nao encontrado" }, { status: 404 })
  }
  if (payout.status === "PAID") {
    return NextResponse.json({ error: "Saque ja pago" }, { status: 409 })
  }
  // Comprovante obrigatorio para marcar como pago.
  if (!payout.proofUrl) {
    return NextResponse.json(
      {
        error:
          "Anexe o comprovante de pagamento antes de marcar o saque como pago.",
      },
      { status: 400 },
    )
  }

  // PMB_RESELLER_MGR só pode aprovar payouts de tenants atribuídos a ele.
  if (session.role === "PMB_RESELLER_MGR") {
    const tenant = await prisma.tenant.findUnique({
      where: { id: payout.referrerTenantId },
      select: { accountManagerId: true },
    })
    if (tenant?.accountManagerId !== session.userId) {
      return NextResponse.json({ error: "Sem permissao" }, { status: 403 })
    }
  }

  // Para DESCONTO_MENSALIDADE, registra somente — admin aplica desconto na proxima fatura manualmente.
  // Futura melhoria: criar TenantPayment com appliedPayoutId vinculando o desconto.
  try {
    const updated = await markPayoutPaid(
      payout.id,
      parsed.data.asaasTransferId ?? null,
    )
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
        event: "admin.referrals.approve_failed",
        payoutId: id,
        prismaError: err instanceof Prisma.PrismaClientKnownRequestError,
      },
      "approve payout falhou",
    )
    const message = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
  },
)
