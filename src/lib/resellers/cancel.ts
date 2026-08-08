/**
 * Cancelamento de uma unidade (revenda) — o núcleo compartilhado.
 *
 * Extraído de `DELETE /api/admin/revendedores/[id]` quando o cancelamento em
 * LOTE apareceu: duplicar um fluxo destrutivo que fala com o Asaas, apaga
 * cobranças em aberto e corta o acesso dos alunos é como as duas metades
 * divergem em silêncio — uma ganha o cancelamento da assinatura promocional e a
 * outra não, e ninguém percebe até a unidade cancelada seguir sendo cobrada.
 *
 * ORDEM IMPORTA: o Asaas vem PRIMEIRO. Se o cancelamento da assinatura falhar,
 * abortamos antes de tocar no banco — marcar `CANCELLED` uma unidade que
 * continua sendo cobrada é o pior dos dois estados possíveis.
 */
import { prisma } from "@/lib/prisma"
import { cancelSubscription, deletePayment, AsaasApiError } from "@/lib/asaas/client"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { blockTenantStudents } from "@/lib/auto-block"
import { swallow } from "@/lib/errors"

export interface CancelTenantOptions {
  /** Cortar o acesso dos alunos junto. */
  blockStudents: boolean
  /** Apagar as mensalidades já emitidas e em aberto. */
  deleteOpenCharges: boolean
}

export interface CancelTenantOutcome {
  ok: true
  cancelledSubscriptions: number
  deletedCharges: number
  studentsBlocked: number
  /** Falhas PARCIAIS que não abortam o cancelamento, mas precisam ser vistas. */
  warnings: string[]
  /** Estado anterior, para a trilha de auditoria do chamador. */
  before: { slug: string; status: string; hadSubscription: boolean; hadPromoSubscription: boolean }
}

export type CancelTenantResult =
  | CancelTenantOutcome
  | { ok: false; status: number; error: string }

export type CancelableTenant = {
  id: string
  slug: string
  status: string
  customDomain: string | null
  asaasSubscriptionId: string | null
  asaasPromoSubscriptionId: string | null
}

/** Campos que `cancelTenant` precisa — use no `select` do chamador. */
export const CANCELABLE_TENANT_SELECT = {
  id: true,
  slug: true,
  status: true,
  customDomain: true,
  asaasSubscriptionId: true,
  asaasPromoSubscriptionId: true,
} as const

export async function cancelTenant(
  tenant: CancelableTenant,
  options: CancelTenantOptions,
): Promise<CancelTenantResult> {
  const before = {
    slug: tenant.slug,
    status: tenant.status,
    hadSubscription: Boolean(tenant.asaasSubscriptionId),
    hadPromoSubscription: Boolean(tenant.asaasPromoSubscriptionId),
  }

  // As DUAS assinaturas: a regular (planValue) e a promocional (primeiras N
  // mensalidades com maxPayments). Cancelar só a regular deixava a promo viva
  // cobrando uma unidade já cancelada.
  const subscriptionIds = [
    tenant.asaasSubscriptionId,
    tenant.asaasPromoSubscriptionId,
  ].filter((s): s is string => Boolean(s))

  for (const subscriptionId of subscriptionIds) {
    try {
      await cancelSubscription(subscriptionId)
    } catch (error) {
      // 404 = a assinatura já não existe no Asaas; qualquer outro erro aborta
      // ANTES de mexer no banco.
      if (error instanceof AsaasApiError && error.statusCode === 404) continue
      return {
        ok: false,
        status: 502,
        error:
          error instanceof AsaasApiError
            ? `Falha ao cancelar assinatura Asaas: ${error.message}`
            : "Falha ao cancelar assinatura Asaas",
      }
    }
  }

  const warnings: string[] = []

  // Mensalidades já emitidas e em aberto: sem apagá-las, o ex-revendedor
  // continua recebendo boleto/PIX de uma assinatura que não existe mais.
  // DELETING é o estado intermediário — o webhook PAYMENT_DELETED confirma
  // para DELETED.
  let deletedCharges = 0
  if (options.deleteOpenCharges) {
    const openCharges = await prisma.tenantPayment.findMany({
      where: { tenantId: tenant.id, status: { in: ["PENDING", "OVERDUE"] } },
      select: { id: true, asaasPaymentId: true },
    })
    for (const charge of openCharges) {
      try {
        await deletePayment(charge.asaasPaymentId)
      } catch (error) {
        if (!(error instanceof AsaasApiError && error.statusCode === 404)) {
          warnings.push(
            `cobrança ${charge.asaasPaymentId}: ${
              error instanceof Error ? error.message : "falha ao apagar no Asaas"
            }`,
          )
          continue
        }
      }
      await prisma.tenantPayment
        .update({ where: { id: charge.id }, data: { status: "DELETING" } })
        .catch(swallow("resellers.cancel"))
      deletedCharges += 1
    }
  }

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { status: "CANCELLED" },
  })

  await invalidateTenant(tenant)

  // Destino dos alunos. Reusa a mesma função do cron de inadimplência.
  let studentsBlocked = 0
  if (options.blockStudents) {
    const block = await blockTenantStudents(tenant.id)
    studentsBlocked = block.affectedStudents
    if (block.errors.length > 0) {
      warnings.push(`${block.errors.length} aluno(s) não puderam ser bloqueados`)
    }
  }

  return {
    ok: true,
    cancelledSubscriptions: subscriptionIds.length,
    deletedCharges,
    studentsBlocked,
    warnings,
    before,
  }
}

/**
 * A unidade quer manter os alunos ativos ao cancelar?
 *
 * `cancellationPolicy.keepStudentsActive` é configurado por unidade em
 * /admin/revendedores e o padrão é MANTER — o aluno pagou o curso dele, a
 * unidade é que não pagou a mensalidade. O cancelamento em lote respeita essa
 * escolha unidade a unidade em vez de impor uma regra global.
 */
export function shouldBlockStudentsOnCancel(
  cancellationPolicy: unknown,
): boolean {
  if (!cancellationPolicy || typeof cancellationPolicy !== "object") return false
  const keep = (cancellationPolicy as { keepStudentsActive?: unknown }).keepStudentsActive
  return keep === false
}
