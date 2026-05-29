import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Marca o tutorial guiado de primeiro acesso como concluído/pulado para o
 * usuário logado (revendedor owner ou consultor). Idempotente.
 */
export const POST = withRequestContext(
  { action: "painel.onboarding_tour.complete", route: "/api/painel/onboarding-tour" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    await prisma.user.update({
      where: { id: ctx.userId },
      data: { onboardingTourCompletedAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  },
)
