import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const ONBOARDING_TOTAL_STEPS = 5

const bodySchema = z.object({
  step: z.number().int().min(1).max(ONBOARDING_TOTAL_STEPS),
  completed: z.boolean().optional(),
})

export async function POST(request: Request) {
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
      { error: "Dados inválidos" },
      { status: 400 },
    )
  }

  const isFinalStep =
    parsed.data.step === ONBOARDING_TOTAL_STEPS && parsed.data.completed === true

  if (isFinalStep) {
    await prisma.tenant.update({
      where: { id: session.user.tenantId as string },
      data: { status: "ACTIVE" },
    })
  }

  return NextResponse.json({
    data: {
      step: parsed.data.step,
      completed: parsed.data.completed ?? false,
      tenantActivated: isFinalStep,
    },
  })
}
