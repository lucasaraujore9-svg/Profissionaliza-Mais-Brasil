import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { failPayout } from "@/lib/referrals/payout"

const bodySchema = z.object({
  reason: z.string().min(3).max(500),
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
    select: { id: true, status: true },
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

  try {
    const updated = await failPayout(id, parsed.data.reason)
    return NextResponse.json({
      data: { id: updated.id, status: updated.status },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno"
    console.error("[referrals] fail falhou:", err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
