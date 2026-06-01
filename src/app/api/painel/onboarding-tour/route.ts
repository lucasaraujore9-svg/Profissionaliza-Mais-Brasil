import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Salva a preferência de exibição do tutorial guiado para o usuário logado
 * (revendedor owner ou consultor).
 *
 * Body: `{ dontShowAgain: boolean }`.
 * - `true`  → grava a data (não auto-exibe mais nos próximos acessos).
 * - `false` → limpa a data (o tour volta a aparecer a cada acesso).
 *
 * Sem body válido, assume `true` por compatibilidade. Idempotente.
 */
export const POST = withRequestContext(
  { action: "painel.onboarding_tour.preference", route: "/api/painel/onboarding-tour" },
  async (req: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let dontShowAgain = true
    try {
      const body = (await req.json()) as { dontShowAgain?: unknown }
      if (typeof body?.dontShowAgain === "boolean") {
        dontShowAgain = body.dontShowAgain
      }
    } catch {
      // Sem corpo JSON → mantém o padrão (true).
    }

    await prisma.user.update({
      where: { id: ctx.userId },
      data: { onboardingTourCompletedAt: dontShowAgain ? new Date() : null },
    })

    return NextResponse.json({ ok: true })
  },
)
