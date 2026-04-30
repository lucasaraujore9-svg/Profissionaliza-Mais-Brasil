import { prisma } from "@/lib/prisma"
import type { PaymentGateway } from "@prisma/client"

const SETTINGS_ID = "default"

export interface SystemSettings {
  pmbDirectSaleGateway: PaymentGateway
  updatedAt: Date
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: { pmbDirectSaleGateway: true, updatedAt: true },
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
    select: { pmbDirectSaleGateway: true, updatedAt: true },
  })
  return row
}
