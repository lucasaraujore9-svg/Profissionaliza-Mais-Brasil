/**
 * Acha a linha de `tenant_payments` de uma fatura da unidade para uma ACAO do
 * admin (baixa manual, estorno, cancelar, editar).
 *
 * O historico de /admin/revendedores/[id] mescla o banco com a lista do Asaas, e
 * a fatura que o webhook nunca espelhou so existe la: a linha chega com o id do
 * Asaas (`pay_...`). Buscar so pelo id do banco respondia 404 "Cobranca nao
 * encontrada" nesses casos (PraxisPb, 26/10/2026). Aqui o `paymentId` vale nas
 * duas formas e, sem espelho local, as cobrancas da unidade sao lidas no Asaas
 * e espelhadas (o vinculo que o webhook nao fez) antes de desistir. Assim a
 * acao sempre age sobre uma linha do banco, e o webhook seguinte
 * (PAYMENT_DELETED etc.) tem onde gravar.
 *
 * Posse: a busca e sempre escopada por `tenantId`, e a reconciliacao so importa
 * cobrancas do CLIENTE Asaas da propria unidade — um `pay_` de outra unidade
 * continua dando null.
 */
import { prisma } from "@/lib/prisma"
import { reconcileTenantPayments } from "@/lib/asaas/reconcile"

const SELECT = { id: true, asaasPaymentId: true } as const

export async function resolveTenantPayment(
  tenant: { id: string; asaasCustomerId: string | null; asaasSubscriptionId: string | null },
  paymentId: string,
): Promise<{ id: string; asaasPaymentId: string } | null> {
  const where = {
    tenantId: tenant.id,
    OR: [{ id: paymentId }, { asaasPaymentId: paymentId }],
  }
  const local = await prisma.tenantPayment.findFirst({ where, select: SELECT })
  if (local) return local
  if (!tenant.asaasCustomerId && !tenant.asaasSubscriptionId) return null

  // Lanca se o Asaas estiver fora: o chamador responde 503, nunca 404 — "nao
  // consegui olhar" nao e "nao existe".
  await reconcileTenantPayments(tenant)
  return prisma.tenantPayment.findFirst({ where, select: SELECT })
}
