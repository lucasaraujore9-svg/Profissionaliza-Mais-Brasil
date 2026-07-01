import type { AdminSession } from "@/lib/auth/admin-session"
import type { ResolvedPeriod } from "../period"
import type { ReportPayload } from "../types"

export { buildPayload } from "../payload"

/** Contexto passado a cada módulo de BI do admin. */
export interface BiContext {
  session: AdminSession
  period: ResolvedPeriod
  /** Filtros crus da query (segment, status, tenantId, etc.). */
  sp: URLSearchParams
}

export interface BiModule {
  run(ctx: BiContext): Promise<ReportPayload>
}
