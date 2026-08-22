import { prisma } from "@/lib/prisma"
import {
  decryptTenantAsaasKey,
  motherAsaasKey,
  retrieveWalletId,
} from "@/lib/asaas/client"
import { contextLogger } from "@/lib/logger"

/**
 * CARTEIRA ASAAS — o gate de KYC do marketplace.
 *
 * Split so existe entre contas Asaas, e o endereco de destino e o `walletId`.
 * Sem ele, a cobranca ate nasce, mas o repasse nunca acontece — e o dinheiro
 * fica inteiro com quem vendeu. Por isso a carteira e verificada ANTES de o
 * curso entrar em qualquer vitrine, nao no meio do checkout.
 *
 * Os dois gates sao de alturas diferentes, de proposito:
 *
 *   RECEBER (o produtor publicando alem da propria loja)
 *     basta `asaasWalletId`. Ele nao emite nada; so recebe.
 *
 *   VENDER curso de terceiro
 *     precisa de `asaasConnected` + `asaasWebhookToken` ALEM da carteira,
 *     porque a cobranca e EMITIDA na conta dele e o rateio sai de la. Sem o
 *     token do webhook a venda ficaria PENDING para sempre (o Asaas notifica
 *     por CONTA, e a nossa rota valida o token daquela conta).
 */

/** O que qualquer um dos gates precisa saber de um tenant. */
export interface WalletGateInput {
  asaasWalletId: string | null
  asaasConnected: boolean
  asaasWebhookToken: string | null
}

/** Pode ser BENEFICIARIO de um split (receber repasse como produtor)? */
export function canReceiveSplit(t: WalletGateInput): boolean {
  return Boolean(t.asaasWalletId)
}

/**
 * Pode EMITIR uma cobranca com rateio (vender curso de outra unidade)?
 *
 * Aceita so o que le, para que o gate do checkout — que carrega o tenant com um
 * `select` estreito — consiga chamar esta funcao em vez de reescrever a regra.
 */
export function canSellAuthoredCourse(
  t: Pick<WalletGateInput, "asaasConnected" | "asaasWebhookToken">,
): boolean {
  return Boolean(t.asaasConnected && t.asaasWebhookToken)
}

/**
 * Carteira da PMB, destino dos 5% quando quem vende e uma unidade.
 *
 * Prefere a env (uma chamada de rede a menos no caminho do checkout) e cai na
 * descoberta pela conta-mae quando ela nao esta setada. Devolve null em vez de
 * lancar: o caller decide — no checkout isso BLOQUEIA a venda, num relatorio
 * so esconde uma coluna.
 */
export async function getPlatformWalletId(): Promise<string | null> {
  const fromEnv = process.env.ASAAS_PMB_WALLET_ID?.trim()
  if (fromEnv) return fromEnv
  try {
    return await retrieveWalletId(motherAsaasKey())
  } catch (err) {
    contextLogger().error(
      { event: "course_authoring.platform_wallet_failed", err },
      "Nao foi possivel descobrir a carteira Asaas da PMB",
    )
    return null
  }
}

export interface SyncWalletResult {
  ok: boolean
  walletId: string | null
  /** Motivo legivel quando `ok` e falso — vai direto para a tela. */
  reason?: string
}

/**
 * Descobre e persiste o `walletId` da unidade a partir da chave Asaas que ela
 * ja conectou. Idempotente; chamada quando a unidade conecta a conta e no
 * momento em que ela tenta publicar um curso alem da propria vitrine.
 */
export async function syncTenantWallet(tenantId: string): Promise<SyncWalletResult> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { asaasApiKey: true, asaasConnected: true, asaasWalletId: true },
  })
  if (!tenant) return { ok: false, walletId: null, reason: "Unidade nao encontrada." }

  if (!tenant.asaasConnected || !tenant.asaasApiKey) {
    return {
      ok: false,
      walletId: tenant.asaasWalletId,
      reason: "Conecte a conta Asaas da unidade antes de publicar cursos proprios.",
    }
  }

  let walletId: string | null
  try {
    walletId = await retrieveWalletId(decryptTenantAsaasKey(tenant.asaasApiKey))
  } catch (err) {
    contextLogger().error(
      { event: "course_authoring.wallet_sync_failed", tenantId, err },
      "Falha ao consultar a carteira Asaas da unidade",
    )
    return {
      ok: false,
      walletId: tenant.asaasWalletId,
      reason: "Nao foi possivel falar com o Asaas agora. Tente novamente.",
    }
  }

  if (!walletId) {
    return {
      ok: false,
      walletId: null,
      reason:
        "A conta Asaas conectada nao devolveu carteira. Conclua o cadastro dela no Asaas.",
    }
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { asaasWalletId: walletId, asaasWalletCheckedAt: new Date() },
  })

  return { ok: true, walletId }
}
