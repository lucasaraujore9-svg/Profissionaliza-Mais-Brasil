import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"

const toggleSchema = z.object({
  isVisible: z.boolean(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id } = await params
  const tc = await prisma.tenantCourse.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, isVisible: true },
  })

  if (!tc) {
    return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
  }

  let payload: unknown = null
  try {
    payload = await request.json()
  } catch {
    payload = null
  }

  const parsed = toggleSchema.safeParse(payload)
  const nextValue = parsed.success ? parsed.data.isVisible : !tc.isVisible

  const updated = await prisma.tenantCourse.update({
    where: { id },
    data: { isVisible: nextValue },
    select: { id: true, isVisible: true },
  })

  return NextResponse.json({ data: updated })
}
