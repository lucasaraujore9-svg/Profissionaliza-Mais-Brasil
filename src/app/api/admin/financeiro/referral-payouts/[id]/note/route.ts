import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

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
}
