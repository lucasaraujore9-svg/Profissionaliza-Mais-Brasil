import { prisma } from "@/lib/prisma"
import type { PaymentGateway } from "@prisma/client"
import { encrypt, decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"

export interface SystemSettings {
  pmbDirectSaleGateway: PaymentGateway
  pmbMpAccessTokenEnc: string | null
  pmbInterestFreeInstallments: number
  updatedAt: Date
}

const SETTINGS_SELECT = {
  pmbDirectSaleGateway: true,
  pmbMpAccessTokenEnc: true,
  pmbInterestFreeInstallments: true,
  updatedAt: true,
} as const

// Cache in-memory de TTL curto: getSystemSettings é lido no hot-path do checkout
// e fazia um upsert (escrita) a cada chamada. TTL curto + invalidação nas escritas
// mantém a escolha de gateway consistente na mesma instância; entre instâncias
// serverless a janela de stale é no máximo SETTINGS_CACHE_TTL_MS.
const SETTINGS_CACHE_TTL_MS = 30_000
let settingsCache: { value: SystemSettings; expires: number } | null = null

export function invalidateSystemSettingsCache(): void {
  settingsCache = null
}

export async function getSystemSettings(): Promise<SystemSettings> {
  if (settingsCache && settingsCache.expires > Date.now()) {
    return settingsCache.value
  }
  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: SETTINGS_SELECT,
  })
  settingsCache = { value: row, expires: Date.now() + SETTINGS_CACHE_TTL_MS }
  return row
}

export async function updatePmbDirectSaleGateway(
  gateway: PaymentGateway,
): Promise<SystemSettings> {
  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { pmbDirectSaleGateway: gateway },
    create: { id: SETTINGS_ID, pmbDirectSaleGateway: gateway },
    select: SETTINGS_SELECT,
  })
  invalidateSystemSettingsCache()
  return row
}

export async function updatePmbMpAccessToken(
  plainToken: string | null,
): Promise<SystemSettings> {
  const enc = plainToken ? encrypt(plainToken) : null
  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { pmbMpAccessTokenEnc: enc },
    create: { id: SETTINGS_ID, pmbMpAccessTokenEnc: enc },
    select: SETTINGS_SELECT,
  })
  invalidateSystemSettingsCache()
  return row
}

export async function updatePmbInterestFreeInstallments(
  value: number,
): Promise<SystemSettings> {
  const clamped = Math.min(Math.max(1, Math.trunc(value)), 12)
  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { pmbInterestFreeInstallments: clamped },
    create: { id: SETTINGS_ID, pmbInterestFreeInstallments: clamped },
    select: SETTINGS_SELECT,
  })
  invalidateSystemSettingsCache()
  return row
}

/**
 * Retorna o access token MP da conta PMB (decifrado). Faz fallback para
 * PMB_MP_ACCESS_TOKEN no env se a coluna ainda nao foi preenchida.
 */
export async function getPmbMpAccessTokenAsync(): Promise<string | null> {
  const row = await prisma.systemSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { pmbMpAccessTokenEnc: true },
  })
  if (row?.pmbMpAccessTokenEnc) {
    try {
      return decrypt(row.pmbMpAccessTokenEnc)
    } catch (err) {
      // FAIL-CLOSED: o token ESTÁ configurado no banco mas a descriptografia
      // falhou (ENCRYPTION_KEY trocada/dessincronizada, ciphertext corrompido).
      // NÃO cair para o env silenciosamente — isso poderia cobrar a venda PMB numa
      // conta MP legada/de teste sem nenhum erro visível (só um log). Falhamos como
      // o caminho por-tenant (decryptTenantMpToken, que não tem try/catch): o
      // checkout trata como credencial indisponível (aborta) em vez de cobrar na
      // conta errada. O env só é fallback quando o token NUNCA foi configurado.
      contextLogger().error(
        { err, event: "system-settings.decrypt_failed", field: "pmbMpAccessToken" },
        "falha ao decifrar pmbMpAccessToken configurado — fail-closed (verifique ENCRYPTION_KEY)",
      )
      throw new Error(
        "pmbMpAccessToken configurado no banco mas não pôde ser descriptografado — verifique ENCRYPTION_KEY",
      )
    }
  }
  return process.env.PMB_MP_ACCESS_TOKEN?.trim() || null
}
