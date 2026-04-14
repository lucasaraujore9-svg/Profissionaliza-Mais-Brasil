import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const bodySchema = z.object({
  mode: z.enum(["AUTO", "MANUAL"]),
})

export async function PATCH(request: Request) {
  const session = await auth()
  if (
    !session?.user ||
    session.user.role !== "RESELLER" ||
    !session.user.tenantId
  ) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Modo inválido" },
      { status: 400 },
    )
  }

  await prisma.tenant.update({
    where: { id: session.user.tenantId as string },
    data: { billingMode: parsed.data.mode },
  })

  return NextResponse.json({ data: { billingMode: parsed.data.mode } })
}
