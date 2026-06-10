import { cache } from "react"
import { readTenantPixels, readPmbPixels } from "./store"
import { isTrackingEmpty, type TrackingPixels, type TrackingProviderKey } from "./schema"

/**
 * Resolve quais pixels renderizar em cada contexto, mesclando as camadas:
 *
 *  - Vitrine de revendedor: pixels do site PMB (self) + pixels GLOBAIS da PMB
 *    + pixels da própria revenda — tudo instalado silenciosamente, sem o
 *    revendedor precisar configurar nada. Se duas camadas configurarem o MESMO
 *    provedor, a mais específica prevalece (revenda > global > self); um pixel
 *    por provedor evita carregar a mesma lib 2x e disparar PageView duplicado.
 *  - Site/vitrine PMB: apenas os pixels "self" da PMB.
 *
 * Leituras são cacheadas por request (React cache) — layout e página de
 * confirmação compartilham a mesma resolução sem refazer a query.
 */

/** Mescla camadas por provedor; camadas posteriores sobrepõem as anteriores. */
export function mergePixels(...layers: TrackingPixels[]): TrackingPixels {
  const out: Record<string, unknown> = {}
  for (const layer of layers) {
    if (!layer) continue
    for (const [key, value] of Object.entries(layer)) {
      if (value && (value as { enabled?: boolean }).enabled !== false) {
        out[key as TrackingProviderKey] = value
      }
    }
  }
  return out as TrackingPixels
}

const getPmb = cache(readPmbPixels)
const getTenant = cache(readTenantPixels)

/** Pixels a renderizar na vitrine do revendedor (PMB self + global + revenda). */
export const resolveVitrinePixels = cache(
  async (tenantId: string): Promise<TrackingPixels> => {
    const [pmb, tenantPixels] = await Promise.all([getPmb(), getTenant(tenantId)])
    return mergePixels(pmb.self, pmb.global, tenantPixels)
  },
)

/** Pixels a renderizar no site institucional + vitrine PMB. */
export const resolvePmbSelfPixels = cache(async (): Promise<TrackingPixels> => {
  const pmb = await getPmb()
  return pmb.self
})

export { isTrackingEmpty }
