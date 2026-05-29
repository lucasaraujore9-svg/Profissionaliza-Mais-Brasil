import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

const schema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CONVERTED", "LOST"]),
})

// Atualiza o status de um Lead de revenda (funil B2B). SUPER_ADMIN e
// PMB_SALES — mesmos papeis que veem /admin/leads-revenda.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession()
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  const { id } = await params

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!lead) {
    return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 })
  }

  await prisma.lead.update({
    where: { id },
    data: { status: parsed.data.status },
  })

  return NextResponse.json({ ok: true })
}
