import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { parseTrackingPixels, type TrackingPixels } from "./schema"

/**
 * Acesso ao banco para os pixels de rastreamento. É o único arquivo que toca os
 * campos `Tenant.trackingPixels` e `SystemSettings.pixelsSelf/pixelsGlobal`.
 * Reads são resilientes (degradam para "sem pixels" em qualquer erro de leitura).
 */

const SETTINGS_ID = "default"

// --- Tenant (revenda) ---

export async function readTenantPixels(tenantId: string): Promise<TrackingPixels> {
  try {
    const row = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { trackingPixels: true },
    })
    return parseTrackingPixels(row?.trackingPixels)
  } catch {
    return {}
  }
}

export async function writeTenantPixels(
  tenant: { id: string; slug: string; customDomain: string | null },
  pixels: TrackingPixels,
): Promise<TrackingPixels> {
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { trackingPixels: pixels },
  })
  await invalidateTenant({
    id: tenant.id,
    slug: tenant.slug,
    customDomain: tenant.customDomain,
  })
  return pixels
}

// --- PMB (sistema mãe) ---

export interface PmbPixels {
  /** Site institucional PMB + vitrine PMB. */
  self: TrackingPixels
  /** Injetados em TODAS as vitrines de revendedores. */
  global: TrackingPixels
}

export async function readPmbPixels(): Promise<PmbPixels> {
  try {
    const row = await prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
      select: { pixelsSelf: true, pixelsGlobal: true },
    })
    return {
      self: parseTrackingPixels(row.pixelsSelf),
      global: parseTrackingPixels(row.pixelsGlobal),
    }
  } catch {
    return { self: {}, global: {} }
  }
}

export async function writePmbPixels(
  scope: "self" | "global",
  pixels: TrackingPixels,
): Promise<PmbPixels> {
  const field = scope === "self" ? "pixelsSelf" : "pixelsGlobal"
  const row = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { [field]: pixels },
    create: { id: SETTINGS_ID, [field]: pixels },
    select: { pixelsSelf: true, pixelsGlobal: true },
  })
  return {
    self: parseTrackingPixels(row.pixelsSelf),
    global: parseTrackingPixels(row.pixelsGlobal),
  }
}
