import { NextResponse } from "next/server"
import { z } from "zod"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

const ONBOARDING_TOTAL_STEPS = 5

const bodySchema = z.object({
  step: z.number().int().min(1).max(ONBOARDING_TOTAL_STEPS),
  completed: z.boolean().optional(),
})

export const POST = withRequestContext(
  { action: "painel.onboarding.progress", route: "/api/painel/onboarding" },
  async (request: Request) => {
    // Progresso do onboarding da unidade: é o dono quem faz esse roteiro.
    const guard = await requirePainel("configuracoes.manage")
    if (!guard.ok) return guard.response

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
  },
)
