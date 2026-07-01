import type { ResolvedPeriod } from "../period"
import type { ReportPayload } from "../types"

export { buildPayload } from "../payload"

/**
 * Contexto dos módulos de BI do painel. `tenantId` é o ANCORADOURO de
 * isolamento multi-tenant (P0): TODA query de todo módulo deve filtrar por ele.
 */
export interface PainelBiContext {
  tenantId: string
  isOwner: boolean
  canSellResellers: boolean
  period: ResolvedPeriod
  sp: URLSearchParams
}

export interface PainelBiModule {
  run(ctx: PainelBiContext): Promise<ReportPayload>
}
