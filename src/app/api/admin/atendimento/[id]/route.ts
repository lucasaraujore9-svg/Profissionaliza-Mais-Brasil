import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z.object({ status: z.enum(["OPEN", "RESOLVED"]) })

// Resolve/reabre uma mensagem da caixa PMB (tenantId null). Mesma permissão que
// abre /admin/atendimento.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin("atendimento.manage")
  if (!guard.ok) return guard.response
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

  const msg = await prisma.contactMessage.findUnique({
    where: { id },
    select: { id: true, tenantId: true },
  })
  if (!msg || msg.tenantId !== null) {
    return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })
  }

  const resolved = parsed.data.status === "RESOLVED"
  await prisma.contactMessage.update({
    where: { id },
    data: {
      status: parsed.data.status,
      resolvedAt: resolved ? new Date() : null,
      resolvedByUserId: resolved ? guard.ctx.userId : null,
    },
  })

  return NextResponse.json({ ok: true })
}
