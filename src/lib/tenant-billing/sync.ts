/**
 * Espelhamento sob demanda das cobranças da unidade contra o Asaas.
 *
 * POR QUE EXISTE: o banco só conhece uma cobrança quando o webhook do Asaas
 * chega e o processador consegue casá-la com o tenant (precisa de `subscription`
 * e do evento `PAYMENT_CREATED` habilitado no painel do Asaas). Nada disso está
 * sob nosso controle. Quando a unidade abre "Minhas cobranças" ela precisa ver a
 * verdade, não o que sobreviveu à cadeia de webhooks — então sincronizamos ali
 * mesmo, antes de renderizar.
 *
 * Best-effort e não-bloqueante em falha: se o Asaas estiver fora, a tela mostra
 * o que o banco tem (o cron diário de reconciliação corrige depois).
 */
import { prisma } from "@/lib/prisma"
import { reconcileTenantPayments } from "@/lib/asaas/reconcile"
import { get as redisGet, set as redisSet } from "@/lib/redis/cache"
import { contextLogger } from "@/lib/logger"

/**
 * Janela de throttle. Sem ela, cada F5 da unidade viraria uma chamada ao Asaas —
 * e o rate limit é compartilhado com o checkout, que não pode ser prejudicado
 * por alguém atualizando uma tela.
 */
const THROTTLE_SECONDS = 120

export async function syncTenantChargesFromAsaas(
  tenantId: string,
): Promise<{ synced: boolean }> {
  const key = `tenant-billing:sync:${tenantId}`

  try {
    // Fail-open: Redis indisponível devolve null e a sincronização acontece.
    // Cair para "sincroniza sempre" é preferível a esconder boleto da unidade.
    if (await redisGet(key)) return { synced: false }
  } catch {
    // idem — falha de comando do Redis não pode bloquear a leitura
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, asaasCustomerId: true, asaasSubscriptionId: true },
  })
  if (!tenant?.asaasCustomerId && !tenant?.asaasSubscriptionId) {
    return { synced: false }
  }

  try {
    await reconcileTenantPayments(tenant)
    await redisSet(key, "1", THROTTLE_SECONDS).catch(() => undefined)
    return { synced: true }
  } catch (error) {
    contextLogger().warn(
      { err: error, event: "tenant_billing.sync_failed", tenantId },
      "sincronização de cobranças com o Asaas falhou (degrada para o banco)",
    )
    return { synced: false }
  }
}
