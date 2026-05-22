import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { markPayoutPaid } from "@/lib/referrals/payout"

const bodySchema = z.object({
  asaasTransferId: z.string().min(1).max(80).optional().nullable(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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
    select: { id: true, status: true, method: true, referrerTenantId: true, amount: true },
  })
  if (!payout) {
    return NextResponse.json({ error: "Saque nao encontrado" }, { status: 404 })
  }
  if (payout.status === "PAID") {
    return NextResponse.json({ error: "Saque ja pago" }, { status: 409 })
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
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[referrals] approve falhou (prisma):", err)
    } else {
      console.error("[referrals] approve falhou:", err)
    }
    const message = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
