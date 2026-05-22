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
    console.error("[financeiro] fail payout:", err)
    const message = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
