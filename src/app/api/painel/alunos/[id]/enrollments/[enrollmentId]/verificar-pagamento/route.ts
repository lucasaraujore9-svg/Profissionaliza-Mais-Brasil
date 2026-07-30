import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { reconcilePendingEnrollment } from "@/lib/mercadopago/process"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"

/**
 * POST /api/painel/alunos/[id]/enrollments/[enrollmentId]/verificar-pagamento
 *
 * "Verificar pagamento": a unidade pergunta ao GATEWAY se aquela cobrança
 * pendente já foi paga e, se foi, efetiva a matrícula na hora — mesmo
 * `fulfillEnrollment` do webhook, idempotente.
 *
 * Por que existe: o webhook é o caminho normal, mas ele depende de uma
 * configuração que vive FORA do nosso sistema (a conta do gateway da própria
 * unidade). Quando ele não chega — webhook não cadastrado, fila interrompida
 * pelo Asaas após falhas, evento perdido —, a venda paga fica PENDING para
 * sempre: o aluno não recebe acesso e a unidade não tem como destravar sozinha.
 * Este endpoint é a saída manual, e nunca confia no clique: só efetiva o que o
 * gateway confirmar.
 *
 * Autorização: `alunos.manage` (mesma da rota irmã de cancelamento) + escopo do
 * papel — sem `alunos.viewAll`, a pessoa só alcança a própria carteira. A conta
 * consultada é sempre a da unidade dona da venda (ver `reconcilePendingEnrollment`).
 */
export const POST = withRequestContextParams<{ id: string; enrollmentId: string }>(
  {
    action: "painel.alunos.enrollments.verify_payment",
    route: "/api/painel/alunos/[id]/enrollments/[enrollmentId]/verificar-pagamento",
  },
  async (_request: Request, ctx) => {
    const guard = await requirePainel("alunos.manage")
    if (!guard.ok) return guard.response
    const { ctx: session } = guard

    const { id: studentId, enrollmentId } = await ctx.params

    const rl = await rateLimitByKey(
      session.userId,
      RATE_LIMITS.gestaoVerificarPagamento,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    // Isolamento pelos dois lados: o aluno é da unidade logada (e da carteira de
    // quem clicou) e a matrícula é do mesmo aluno E da mesma unidade.
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId: session.tenantId, ...session.scope.alunos },
      select: { id: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, studentId, tenantId: session.tenantId },
      select: { id: true, status: true, gateway: true },
    })
    if (!enrollment) {
      return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })
    }

    if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
      return NextResponse.json({
        data: { status: "confirmed", alreadyProcessed: true },
      })
    }
    // SUSPENDED entra: cobrança vencida que o aluno pagou depois continua
    // liquidável no gateway, e é justamente o caso que o webhook perdido deixa
    // preso. CANCELLED não — a venda foi desfeita.
    if (enrollment.status !== "PENDING" && enrollment.status !== "SUSPENDED") {
      return NextResponse.json(
        { error: "Esta matrícula não tem cobrança em aberto para verificar" },
        { status: 409 },
      )
    }

    let result
    try {
      result = await reconcilePendingEnrollment(enrollment.id)
    } catch (err) {
      contextLogger().error(
        {
          err,
          event: "painel.alunos.verify_payment.failed",
          enrollmentId: enrollment.id,
          gateway: enrollment.gateway,
        },
        "verificação de pagamento falhou",
      )
      return NextResponse.json(
        {
          error:
            "Não foi possível consultar o gateway agora. Tente novamente em alguns minutos.",
          code: "GATEWAY_UNAVAILABLE",
        },
        { status: 502 },
      )
    }

    if (result.status === "confirmed") {
      // Liberar acesso a partir de uma ação manual precisa de trilha: é dinheiro
      // entrando e matrícula sendo efetivada fora do fluxo automático.
      await logAudit({
        action: "enrollment.payment.verify",
        resource: "Enrollment",
        resourceId: enrollment.id,
        actorUserId: session.userId,
        actorRole: "RESELLER",
        tenantId: session.tenantId,
        payloadAfter: {
          studentId,
          gateway: enrollment.gateway,
          previousStatus: enrollment.status,
          outcome: "confirmed",
        },
      })
    }

    return NextResponse.json({ data: result })
  },
)
