import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Salva a preferência de exibição do tutorial guiado para o usuário logado
 * (revendedor owner ou consultor).
 *
 * Body: `{ dontShowAgain: boolean }`.
 * - `true`  → grava a data (não auto-exibe mais nos próximos acessos).
 * - `false` → limpa a data (o tour volta a aparecer a cada acesso).
 *
 * Corpo ausente/malformado → 400 (padrão do projeto: valida no servidor).
 * Idempotente.
 */
const bodySchema = z.object({ dontShowAgain: z.boolean() })

export const POST = withRequestContext(
  { action: "painel.onboarding_tour.preference", route: "/api/painel/onboarding-tour" },
  async (req: Request) => {
    const guard = await requirePainel("dashboard.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await req.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: ctx.userId },
      data: {
        onboardingTourCompletedAt: parsed.data.dontShowAgain ? new Date() : null,
      },
    })

    return NextResponse.json({ ok: true })
  },
)
