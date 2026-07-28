import type { AdminContext } from "@/lib/auth/admin-guard"
import type { ResolvedPeriod } from "../period"
import type { ReportPayload } from "../types"

export { buildPayload } from "../payload"

/** Contexto passado a cada módulo de BI do admin. */
export interface BiContext {
  /** Sessão + permissões efetivas de quem pediu o relatório. */
  session: AdminContext
  period: ResolvedPeriod
  /** Filtros crus da query (segment, status, tenantId, etc.). */
  sp: URLSearchParams
}

export interface BiModule {
  run(ctx: BiContext): Promise<ReportPayload>
}
