import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"

const schema = z.object({ status: z.enum(["OPEN", "RESOLVED"]) })

// Resolve/reabre uma mensagem da caixa PMB (tenantId null). SUPER_ADMIN e
// PMB_SALES — mesmos papeis que veem /admin/atendimento.
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
      resolvedByUserId: resolved ? session.userId : null,
    },
  })

  return NextResponse.json({ ok: true })
}
