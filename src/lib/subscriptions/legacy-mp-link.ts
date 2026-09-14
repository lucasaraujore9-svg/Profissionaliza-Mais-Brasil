import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { cancelPreapproval, getPreapproval } from "@/lib/mercadopago/client"
import { resolveEnrollmentGatewayKeys } from "@/lib/enrollment/gateway-credentials"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { storeBaseUrl } from "@/lib/tenant/urls"
import { logAudit } from "@/lib/audit"
import { getPlanForCheckout } from "./plans"
import { storeSubscriptionPaymentPath } from "./direct-sale"

/**
 * Remediação das vendas diretas de assinatura feitas pelo /painel ANTES de o
 * link passar a ser a página de pagamento da loja (2026-09-14).
 *
 * Até ali a venda criava o preapproval `pending` no Mercado Pago na hora e o
 * vendedor mandava o `init_point` ao aluno — a página do MP, fora da loja da
 * unidade. Esses links continuam vivos no MP e na lista de vendas diretas.
 *
 * A linha antiga NÃO é convertida em link da loja: o preapproval foi criado com
 * `X-Idempotency-Key = pmb_sub_<id>`, e o pagamento na loja reusaria a MESMA
 * chave — o MP devolveria o preapproval pendente (agora cancelado) em vez de
 * criar a assinatura com o cartão. Por isso ela é CANCELADA e a venda é
 * reemitida numa linha nova, com as condições congeladas da original.
 */

/** Só vendas diretas de unidade, ainda sem pagamento, cujo link é do MP. */
export const LEGACY_MP_LINK_WHERE = {
  status: "PENDING",
  tenantId: { not: null },
  soldByUserId: { not: null },
  mpPreapprovalId: { not: null },
  startedAt: null,
  checkoutUrl: { startsWith: "https://www.mercadopago.com" },
  payments: { none: {} },
} satisfies Prisma.StudentSubscriptionWhereInput

export type LegacyLinkDecision =
  /** Cancela no MP e aqui, e reemite a venda com o link da loja. */
  | "cancel_and_reissue"
  /** Cancela no MP e aqui; a loja não vende mais o plano, então não reemite. */
  | "cancel_only"
  /** O aluno já autorizou (ou pausou) no MP: cancelar cortaria quem pagou. */
  | "manual_review"
  /** Não deu para ler o estado no MP. Na dúvida, não destrói nada. */
  | "unverified"

export function decideLegacyLink(input: {
  mpStatus: string | null
  canReissue: boolean
}): LegacyLinkDecision {
  if (input.mpStatus === null) return "unverified"
  if (input.mpStatus !== "pending" && input.mpStatus !== "cancelled") {
    return "manual_review"
  }
  return input.canReissue ? "cancel_and_reissue" : "cancel_only"
}

export interface LegacyLinkOutcome {
  subscriptionId: string
  tenantSlug: string
  mpStatus: string | null
  decision: LegacyLinkDecision
  applied: boolean
  newSubscriptionId?: string
  newCheckoutUrl?: string
  error?: string
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function remediateLegacyMpLinks(opts: {
  apply: boolean
}): Promise<LegacyLinkOutcome[]> {
  const subs = await prisma.studentSubscription.findMany({
    where: LEGACY_MP_LINK_WHERE,
    select: {
      id: true,
      studentId: true,
      tenantId: true,
      planId: true,
      priceAtPurchase: true,
      interval: true,
      soldByUserId: true,
      couponId: true,
      checkoutUrl: true,
      mpPreapprovalId: true,
      tenant: {
        select: {
          slug: true,
          customDomain: true,
          domainVerified: true,
          salesGateway: true,
          asaasApiKey: true,
          asaasWebhookToken: true,
          mpAccessToken: true,
          mpPublicKey: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  })

  const outcomes: LegacyLinkOutcome[] = []

  for (const sub of subs) {
    const tenant = sub.tenant
    const preapprovalId = sub.mpPreapprovalId
    if (!tenant || !sub.tenantId || !preapprovalId) continue

    // Estado VIVO, com o token da conta que criou o preapproval.
    let mpStatus: string | null = null
    let token: string | undefined
    try {
      token = (await resolveEnrollmentGatewayKeys({ tenantId: sub.tenantId })).mpAccessToken
      if (token) mpStatus = (await getPreapproval(token, preapprovalId)).status
    } catch {
      mpStatus = null
    }

    const mode = tenantCheckoutMode({
      salesGateway: tenant.salesGateway,
      asaasConnected: Boolean(tenant.asaasApiKey && tenant.asaasWebhookToken),
      mpAccessToken: tenant.mpAccessToken,
      mpPublicKey: tenant.mpPublicKey,
    })
    const plan =
      mode === "NONE" ? null : await getPlanForCheckout(sub.tenantId, sub.planId)

    const outcome: LegacyLinkOutcome = {
      subscriptionId: sub.id,
      tenantSlug: tenant.slug,
      mpStatus,
      decision: decideLegacyLink({ mpStatus, canReissue: Boolean(plan) }),
      applied: false,
    }
    outcomes.push(outcome)

    if (!opts.apply) continue
    if (outcome.decision === "manual_review" || outcome.decision === "unverified") {
      continue
    }

    // 1. Mata o link no MP ANTES de mexer aqui: se o cancelamento falhar, a
    //    linha segue apontando para um link que ainda cobra.
    if (mpStatus === "pending") {
      try {
        const cancelled = await cancelPreapproval(token!, preapprovalId)
        if (cancelled.status !== "cancelled") {
          outcome.error = `MP respondeu status ${cancelled.status} ao cancelar`
          continue
        }
      } catch (err) {
        outcome.error = `falha ao cancelar no MP: ${errorMessage(err)}`
        continue
      }
    }

    // 2. CAS: só cancela a linha que continua exatamente como foi lida.
    const { count } = await prisma.studentSubscription.updateMany({
      where: { id: sub.id, status: "PENDING", mpPreapprovalId: preapprovalId },
      data: { status: "CANCELLED", cancelledAt: new Date(), checkoutUrl: null },
    })
    if (count !== 1) {
      outcome.error = "a assinatura mudou desde a leitura; nada foi alterado aqui"
      continue
    }
    outcome.applied = true

    // 3. Reemite com as condições CONGELADAS da venda original — nunca o preço
    //    ou a periodicidade de hoje do catálogo. Sem ids de gateway: a cobrança
    //    nasce quando o aluno paga na loja, com chave de idempotência nova.
    if (outcome.decision === "cancel_and_reissue" && mode !== "NONE") {
      let newId: string | undefined
      try {
        const created = await prisma.studentSubscription.create({
          data: {
            studentId: sub.studentId,
            tenantId: sub.tenantId,
            planId: sub.planId,
            status: "PENDING",
            priceAtPurchase: sub.priceAtPurchase,
            interval: sub.interval,
            gateway: mode,
            billingType: "UNDEFINED",
            soldByUserId: sub.soldByUserId,
            couponId: sub.couponId,
          },
          select: { id: true },
        })
        newId = created.id
        const url = `${storeBaseUrl(tenant)}${storeSubscriptionPaymentPath(newId)}`
        await prisma.studentSubscription.update({
          where: { id: newId },
          data: { checkoutUrl: url },
        })
        outcome.newSubscriptionId = newId
        outcome.newCheckoutUrl = url
      } catch (err) {
        // Linha nova sem link travaria a próxima venda para o aluno com 409.
        if (newId) {
          await prisma.studentSubscription
            .delete({ where: { id: newId } })
            .catch(() => undefined)
        }
        outcome.error = `cancelada, mas a reemissão falhou: ${errorMessage(err)}`
      }
    }

    await logAudit({
      action: "subscription.legacy_mp_link.remediated",
      resource: "StudentSubscription",
      resourceId: sub.id,
      actorRole: "SYSTEM",
      tenantId: sub.tenantId,
      payloadBefore: {
        status: "PENDING",
        checkoutUrl: sub.checkoutUrl,
        mpPreapprovalId: preapprovalId,
        mpStatus,
      },
      payloadAfter: {
        status: "CANCELLED",
        origem: "remediacao_link_mp",
        newSubscriptionId: outcome.newSubscriptionId ?? null,
        newCheckoutUrl: outcome.newCheckoutUrl ?? null,
        error: outcome.error ?? null,
      },
    })
  }

  return outcomes
}
