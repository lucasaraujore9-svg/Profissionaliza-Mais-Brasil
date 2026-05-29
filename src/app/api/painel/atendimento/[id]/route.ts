import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

const schema = z.object({ status: z.enum(["OPEN", "RESOLVED"]) })

// Resolve/reabre uma mensagem da caixa da unidade. Escopo estrito: so o
// proprio tenant da sessao — nunca mensagens de outra revenda nem da PMB.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const tenantId = session.user.tenantId

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
  if (!msg || msg.tenantId !== tenantId) {
    return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })
  }

  const resolved = parsed.data.status === "RESOLVED"
  await prisma.contactMessage.update({
    where: { id },
    data: {
      status: parsed.data.status,
      resolvedAt: resolved ? new Date() : null,
      resolvedByUserId: resolved ? session.user.id : null,
    },
  })

  return NextResponse.json({ ok: true })
}
