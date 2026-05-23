import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"

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

  // Ativação do tenant é responsabilidade exclusiva do webhook Asaas
  // (PAYMENT_RECEIVED em src/lib/asaas/process.ts). O onboarding apenas
  // registra a progressão de UI; nunca altera tenant.status.
  const completed =
    parsed.data.step === ONBOARDING_TOTAL_STEPS && parsed.data.completed === true

  return NextResponse.json({
    data: {
      step: parsed.data.step,
      completed,
      tenantActivated: false,
    },
  })
}
