import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import {
  getPayment as getAsaasPayment,
  listPayments as listAsaasPayments,
  deletePayment as deleteAsaasPayment,
  cancelSubscription as cancelAsaasSubscription,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import { releaseCoupon } from "@/lib/coupons/consume"
import { logAudit } from "@/lib/audit"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Status Asaas que comprovam pagamento real — NÃO podem ser cancelados às cegas.
const ASAAS_PAID = new Set(["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"])

/**
 * Detecção + remediação das vendas de revenda que COLAPSARAM para a conta-mãe.
 *
 * Assinatura do colapso (ver assert-tenant-gateway.ts + investigação Polo Betim):
 *   enrollment.tenantId = null  (vitrine PMB)  ·  o aluno pertence a uma revenda
 *   REAL (student.tenant.slug != "__pmb__"). Ou seja: a matrícula foi criada no
 *   ramo PMB de /api/aluno/comprar e cobrada na conta-mãe (Asaas OU MP, conforme
 *   `pmbDirectSaleGateway` no momento), embora o aluno seja de uma unidade.
 *
 * Comportamento:
 *   - default (dry-run): apenas LISTA os casos (read-only). Seguro.
 *   - ?apply=true: REMEDIA apenas os casos AUTO-REMEDIÁVEIS — gateway ASAAS,
 *     status PENDING **e cuja cobrança na conta-mãe esteja comprovadamente NÃO
 *     paga ao re-checar o status VIVO no Asaas**. Para cada um: apaga a matrícula
 *     órfã (barreira de idempotência — re-runs não a reencontram), cancela a
 *     cobrança na conta-mãe, libera o cupom e registra trilha de auditoria,
 *     liberando o aluno para recomprar pela conta da própria revenda.
 *
 *     NÃO são tocados e voltam para revisão manual:
 *       · status != PENDING (já pago/cancelado) → `needsManualReview`
 *       · gateway != ASAAS (colapso no MP da PMB) → `needsManualReview`
 *       · re-check ao vivo indica cobrança JÁ PAGA → `skippedAlreadyPaid`
 *         (webhook PAYMENT_RECEIVED pode ter atrasado: o local está PENDING mas o
 *          Asaas já recebeu — cancelar destruiria uma cobrança paga)
 *       · re-check ao vivo falhou (não deu para confirmar) → `skippedUnverified`
 *         (falha fechada: na dúvida, não destrói)
 *
 * Auth: CRON_SECRET (Bearer). Dispare via app_internal.run_cron (Management API)
 * ou Vercel cron — roda no runtime de produção, onde ASAAS_API_KEY existe.
 */
// Disparado pelo `app_internal.run_cron` (net.http_post) como os demais crons, e
// também acionável por GET manual. Ambos os métodos compartilham o handler.
async function handle(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const apply = new URL(request.url).searchParams.get("apply") === "true"

  const candidates = await prisma.enrollment.findMany({
    where: {
      tenantId: null,
      student: { tenant: { slug: { not: PMB_TENANT_SLUG } } },
    },
    select: {
      id: true,
      status: true,
      gateway: true,
      finalAmount: true,
      couponId: true,
      asaasPaymentId: true,
      asaasSubscriptionId: true,
      student: {
        select: { id: true, email: true, tenant: { select: { slug: true } } },
      },
      course: { select: { nome: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const items = candidates.map((e) => ({
    enrollmentId: e.id,
    status: e.status,
    gateway: e.gateway,
    resellerSlug: e.student.tenant?.slug ?? null,
    studentEmail: e.student.email,
    course: e.course.nome,
    finalAmount: Number(e.finalAmount),
    asaasPaymentId: e.asaasPaymentId,
    asaasSubscriptionId: e.asaasSubscriptionId,
  }))

  // Auto-remediável SOMENTE: gateway ASAAS + PENDING. O resto (já pago/cancelado,
  // ou colapso no MP) exige decisão manual de estorno/repasse.
  const isRemediable = (e: (typeof candidates)[number]) =>
    e.gateway === "ASAAS" && e.status === "PENDING"
  const needsManualReview = items.filter(
    (i) => i.gateway !== "ASAAS" || i.status !== "PENDING",
  )

  if (!apply) {
    return NextResponse.json({
      dryRun: true,
      found: items.length,
      remediable: candidates.filter(isRemediable).length,
      needsManualReview,
      items,
    })
  }

  // ── Remediação (somente ASAAS + PENDING + comprovadamente NÃO pago) ──
  const motherKey = motherAsaasKey()
  let remediated = 0
  const skippedAlreadyPaid: string[] = []
  const skippedUnverified: string[] = []
  const errors: string[] = []

  for (const e of candidates) {
    if (!isRemediable(e)) continue

    // 1) Re-check do status VIVO no Asaas ANTES de qualquer ação destrutiva. Um
    //    PENDING local pode esconder uma cobrança já RECEBIDA (webhook atrasou).
    //    Falha de rede aqui ⇒ não conseguimos confirmar ⇒ NÃO destrói (fail-safe).
    let livePaid = false
    try {
      if (e.asaasSubscriptionId) {
        const pays = await listAsaasPayments(
          { subscription: e.asaasSubscriptionId, limit: 100, offset: 0 },
          motherKey,
        )
        livePaid = (pays.data ?? []).some((p) => ASAAS_PAID.has(p.status))
      }
      if (!livePaid && e.asaasPaymentId) {
        const pay = await getAsaasPayment(e.asaasPaymentId, motherKey).catch((err) => {
          // 404 = cobrança não existe mais na conta-mãe → tratamos como não-paga.
          if (err instanceof AsaasApiError && err.statusCode === 404) return null
          throw err
        })
        livePaid = pay ? ASAAS_PAID.has(pay.status) : false
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      skippedUnverified.push(`${e.id}: ${msg}`)
      contextLogger().warn(
        { err, event: "fix_gateway_collapse.recheck_failed", enrollmentId: e.id },
        "não foi possível confirmar status vivo no Asaas — não remediado",
      )
      continue
    }
    if (livePaid) {
      skippedAlreadyPaid.push(e.id)
      contextLogger().warn(
        { event: "fix_gateway_collapse.already_paid", enrollmentId: e.id },
        "cobrança colapsada JÁ PAGA na conta-mãe — exige decisão manual de estorno/repasse",
      )
      continue
    }

    try {
      // 2) Apaga a matrícula órfã PRIMEIRO: é a barreira de idempotência (um re-run
      //    não a reencontra) e garante que nunca cancelamos a cobrança deixando
      //    para trás uma matrícula PENDING com invoice morta.
      await prisma.enrollment.delete({ where: { id: e.id } })

      // 3) Cancela a cobrança na conta-mãe (é lá que ela caiu). 404 = já não existe.
      if (e.asaasSubscriptionId) {
        await cancelAsaasSubscription(e.asaasSubscriptionId).catch((err) => {
          if (err instanceof AsaasApiError && err.statusCode === 404) return
          throw err
        })
      }
      if (e.asaasPaymentId) {
        await deleteAsaasPayment(e.asaasPaymentId).catch((err) => {
          if (err instanceof AsaasApiError && err.statusCode === 404) return
          throw err
        })
      }

      // 4) Libera o cupom reservado por ÚLTIMO — só após a matrícula sumir, para
      //    que um re-run (que não a reencontra) não decremente o cupom 2x.
      if (e.couponId) {
        await releaseCoupon(e.couponId).catch(
          swallow("fix-gateway-collapse.release_coupon"),
        )
      }

      // 5) Trilha de auditoria (CLAUDE.md: exclusão/billing registram quem/o quê).
      await logAudit({
        action: "enrollment.gateway_collapse_remediated",
        resource: "Enrollment",
        resourceId: e.id,
        actorRole: "SYSTEM",
        actorEmail: "cron:fix-gateway-collapse",
        tenantId: null,
        payloadBefore: {
          status: e.status,
          gateway: e.gateway,
          resellerSlug: e.student.tenant?.slug ?? null,
          studentId: e.student.id,
          studentEmail: e.student.email,
          course: e.course.nome,
          finalAmount: Number(e.finalAmount),
          asaasPaymentId: e.asaasPaymentId,
          asaasSubscriptionId: e.asaasSubscriptionId,
          couponId: e.couponId,
        },
        payloadAfter: { deleted: true },
      })

      remediated++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${e.id}: ${msg}`)
      contextLogger().error(
        { err, event: "fix_gateway_collapse.remediation_failed", enrollmentId: e.id },
        "falha ao remediar matrícula colapsada",
      )
    }
  }

  return NextResponse.json({
    dryRun: false,
    found: items.length,
    remediated,
    skippedAlreadyPaid,
    skippedUnverified,
    needsManualReview,
    errors,
  })
}

export const GET = handle
export const POST = handle
