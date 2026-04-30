import { prisma } from "@/lib/prisma"
import type { PaymentGateway } from "@prisma/client"
import { encrypt, decrypt } from "@/lib/crypto"

const SETTINGS_ID = "default"

export interface SystemSettings {
  pmbDirectSaleGateway: PaymentGateway
  pmbMpAccessTokenEnc: string | null
  updatedAt: Date
}

export async function getSystemSettings(): Promise<SystemSettings> {
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
      console.error("[system-settings] falha ao decifrar pmbMpAccessToken:", err)
    }
  }
  return process.env.PMB_MP_ACCESS_TOKEN?.trim() || null
}
