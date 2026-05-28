import { prisma } from "@/lib/prisma"
import type { PaymentGateway } from "@prisma/client"
import { encrypt, decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"

export interface SystemSettings {
  pmbDirectSaleGateway: PaymentGateway
  pmbMpAccessTokenEnc: string | null
  updatedAt: Date
}

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
    select: {
      pmbDirectSaleGateway: true,
      pmbMpAccessTokenEnc: true,
      updatedAt: true,
    },
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
    select: {
      pmbDirectSaleGateway: true,
      pmbMpAccessTokenEnc: true,
      updatedAt: true,
    },
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
    select: {
      pmbDirectSaleGateway: true,
      pmbMpAccessTokenEnc: true,
      updatedAt: true,
    },
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
      contextLogger().error(
        { err, event: "system-settings.decrypt_failed", field: "pmbMpAccessToken" },
        "falha ao decifrar pmbMpAccessToken — usando fallback de env",
      )
    }
  }
  return process.env.PMB_MP_ACCESS_TOKEN?.trim() || null
}
