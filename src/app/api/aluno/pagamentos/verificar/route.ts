import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  rateLimitByKey,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/ratelimit"
import { reconcilePendingEnrollment } from "@/lib/mercadopago/process"
import { contextLogger } from "@/lib/logger"

const bodySchema = z.object({ enrollmentId: z.string().min(1).max(64) })

/**
 * "Já fiz o pagamento" — o aluno dispara uma reconciliação sob demanda.
 * Consultamos o gateway (Mercado Pago) pela referência da matrícula e, se o
 * pagamento estiver aprovado, efetivamos a matrícula na hora (mesma rota do
 * webhook, idempotente). Caso contrário pedimos para aguardar.
 *
 * Segurança: a matrícula precisa pertencer ao aluno logado e só é efetivada se
 * o GATEWAY confirmar — nunca confiamos no clique do aluno.
 */
export const POST = withRequestContext(
  { action: "aluno.pagamentos.verificar", route: "/api/aluno/pagamentos/verificar" },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const rl = await rateLimitByKey(
      session.studentId,
      RATE_LIMITS.alunoVerificarPagamento,
    )
    if (!rl.ok) return rateLimitResponse(rl)

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

    // Ownership: a cobrança precisa ser do aluno logado.
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: parsed.data.enrollmentId, studentId: session.studentId },
      select: { id: true },
    })
    if (!enrollment) {
      return NextResponse.json(
        { error: "Cobrança não encontrada" },
        { status: 404 },
      )
    }

    try {
      const result = await reconcilePendingEnrollment(enrollment.id)
      return NextResponse.json({ data: result })
    } catch (err) {
      // Falha ao falar com o gateway — não expomos detalhe ao aluno e tratamos
      // como "ainda processando" (o webhook ainda pode chegar depois).
      contextLogger().error(
        {
          err,
          event: "aluno.pagamentos.verificar.failed",
          enrollmentId: enrollment.id,
        },
        "reconciliação de pagamento do aluno falhou",
      )
      return NextResponse.json({ data: { status: "pending" } })
    }
  },
)
