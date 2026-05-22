import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { markPayoutPaid } from "@/lib/referrals/payout"

const bodySchema = z.object({
  asaasTransferId: z.string().min(1).max(80).optional().nullable(),
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
    select: { id: true, status: true, notes: true },
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

  const adminName = session.name ?? session.email ?? "Admin"
  const noteText = parsed.data.note?.trim()
  const baseNote = `Marcado como pago manualmente.${noteText ? ` ${noteText}` : ""}`
  const nextNotes = appendNote(payout.notes, baseNote, adminName)

  try {
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

    return NextResponse.json({
      data: {
        id: updated.id,
        status: updated.status,
        amount: Number(updated.amount),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[financeiro] mark-paid payout prisma:", err)
    } else {
      console.error("[financeiro] mark-paid payout:", err)
    }
    const message = err instanceof Error ? err.message : "Erro interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
