import { prisma } from "@/lib/prisma"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { tenantCheckoutMode, type CheckoutMode } from "@/lib/tenant/checkout-mode"
import { decryptTenantAsaasKey } from "@/lib/asaas/client"
import { decryptTenantMpToken } from "@/lib/mercadopago/client"

/**
 * Onde o aluno JÁ LOGADO assina: a vitrine dele e a conta que recebe.
 *
 * Duas armadilhas que a rota do aluno logado caía, as duas com 502 depois de
 * listar os planos:
 *  - O aluno da vitrine PMB tem `tenantId` = placeholder `__pmb__`, que NÃO é
 *    revenda: tratado como tal, a lista de planos saía vazia.
 *  - O aluno de revenda era cobrado sem a chave da unidade, e o assert de
 *    isolamento recusava (fail-closed) — o cliente da unidade não tinha por onde
 *    assinar, porque o checkout anônimo o manda para cá com "faça login".
 */
export interface StudentSubscriptionStore {
  /** Vitrine da assinatura: null = vitrine PMB. */
  scopeTenantId: string | null
  gateway: CheckoutMode
  account: { asaasApiKey?: string; mpAccessToken?: string; tenantSlug?: string }
}

export async function resolveStudentSubscriptionStore(
  sessionTenantId: string | null | undefined,
): Promise<StudentSubscriptionStore> {
  const tenant = sessionTenantId
    ? await prisma.tenant.findUnique({
        where: { id: sessionTenantId },
        select: {
          id: true,
          slug: true,
          status: true,
          salesGateway: true,
          asaasApiKey: true,
          asaasWebhookToken: true,
          mpAccessToken: true,
          mpPublicKey: true,
        },
      })
    : null

  // A vitrine PMB assina sempre pelo Asaas da conta-mãe (ver /api/checkout/assinatura).
  if (!tenant || tenant.slug === PMB_TENANT_SLUG) {
    return { scopeTenantId: null, gateway: "ASAAS", account: {} }
  }

  const gateway =
    tenant.status === "ACTIVE"
      ? tenantCheckoutMode({
          salesGateway: tenant.salesGateway,
          asaasConnected: Boolean(tenant.asaasApiKey && tenant.asaasWebhookToken),
          mpAccessToken: tenant.mpAccessToken,
          mpPublicKey: tenant.mpPublicKey,
        })
      : "NONE"

  return {
    scopeTenantId: tenant.id,
    gateway,
    account: {
      asaasApiKey: tenant.asaasApiKey ? decryptTenantAsaasKey(tenant.asaasApiKey) : undefined,
      mpAccessToken: tenant.mpAccessToken
        ? decryptTenantMpToken(tenant.mpAccessToken)
        : undefined,
      tenantSlug: tenant.slug,
    },
  }
}
