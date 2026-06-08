import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { parseTrackingPixels, type TrackingPixels } from "./schema"

/**
 * Acesso ao banco para os pixels de rastreamento. É o ÚNICO arquivo que toca os
 * campos `Tenant.trackingPixels` e `SystemSettings.pixelsSelf/pixelsGlobal`.
 *
 * NOTA (scaffold): esses campos são adicionados ao schema.prisma na fase de
 * "plug-in" (migration tracking_pixels). Até `npx prisma generate` rodar com
 * eles, o client tipado não os conhece — por isso os acessos abaixo usam um
 * cast localizado (`prismaAny`). Quando a migration entrar, basta trocar
 * `prismaAny` por `prisma` e o `select`/`data` tipado volta a funcionar.
 */
// TODO(tracking-pixels): remover quando os campos existirem no Prisma Client.
const prismaAny = prisma as unknown as {
  tenant: {
    findUnique: (args: unknown) => Promise<{ trackingPixels: unknown } | null>
    update: (args: unknown) => Promise<unknown>
  }
  systemSettings: {
    upsert: (args: unknown) => Promise<{ pixelsSelf: unknown; pixelsGlobal: unknown }>
  }
}

const SETTINGS_ID = "default"

// --- Tenant (revenda) ---

export async function readTenantPixels(tenantId: string): Promise<TrackingPixels> {
  try {
    const row = await prismaAny.tenant.findUnique({
      where: { id: tenantId },
      select: { trackingPixels: true },
    })
    return parseTrackingPixels(row?.trackingPixels)
  } catch {
    // Coluna ainda não migrada (scaffold) — degrada para "sem pixels".
    return {}
  }
}

export async function writeTenantPixels(
  tenant: { id: string; slug: string; customDomain: string | null },
  pixels: TrackingPixels,
): Promise<TrackingPixels> {
  await prismaAny.tenant.update({
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
    const row = await prismaAny.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
      select: { pixelsSelf: true, pixelsGlobal: true },
    })
    return {
      self: parseTrackingPixels(row?.pixelsSelf),
      global: parseTrackingPixels(row?.pixelsGlobal),
    }
  } catch {
    // Colunas ainda não migradas (scaffold) — degrada para "sem pixels".
    return { self: {}, global: {} }
  }
}

export async function writePmbPixels(
  scope: "self" | "global",
  pixels: TrackingPixels,
): Promise<PmbPixels> {
  const field = scope === "self" ? "pixelsSelf" : "pixelsGlobal"
  const row = await prismaAny.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: { [field]: pixels },
    create: { id: SETTINGS_ID, [field]: pixels },
    select: { pixelsSelf: true, pixelsGlobal: true },
  })
  return {
    self: parseTrackingPixels(row?.pixelsSelf),
    global: parseTrackingPixels(row?.pixelsGlobal),
  }
}
