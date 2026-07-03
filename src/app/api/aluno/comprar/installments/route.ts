import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import {
  decryptTenantMpToken,
  getCardInstallments,
  MPApiError,
} from "@/lib/mercadopago/client"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Parcelas reais do cartão para a recompra do aluno. Resolve o tenant pela
 * SESSÃO (domínio-independente, em vez dos headers do proxy) e consulta o MP
 * com o access token DA UNIDADE. Se o token/MP falhar, devolve lista vazia e o
 * checkout cai na síntese (1..12) — nunca derruba a tela.
 */
const bodySchema = z.object({
  amount: z.number().positive().max(1_000_000),
  bin: z.string().regex(/^\d{6,8}$/),
})

export const POST = withRequestContext(
  { action: "aluno.comprar.installments", route: "/api/aluno/comprar/installments" },
  async (request: Request) => {
    const rl = await rateLimit(request, RATE_LIMITS.installments)
    if (!rl.ok) return rateLimitResponse(rl)

    const session = await requireStudentSession()
    if (!session?.tenantId) {
      return NextResponse.json({ data: { payerCosts: [], reason: "no_tenant" } })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { mpAccessToken: true },
    })
    if (!tenant?.mpAccessToken) {
      return NextResponse.json({ data: { payerCosts: [], reason: "no_token" } })
    }

    try {
      const payerCosts = await getCardInstallments(
        decryptTenantMpToken(tenant.mpAccessToken),
        { amount: parsed.data.amount, bin: parsed.data.bin.slice(0, 6) },
      )
      return NextResponse.json({
        data: { payerCosts, reason: payerCosts.length ? "ok" : "empty" },
      })
    } catch (error) {
      contextLogger().warn(
        { err: String(error), event: "aluno.comprar.installments.failed" },
        "falha ao consultar parcelas no MP — checkout cai na síntese",
      )
      const reason =
        error instanceof MPApiError ? `mp_error:${error.statusCode}` : "error"
      return NextResponse.json({ data: { payerCosts: [], reason } })
    }
  },
)
