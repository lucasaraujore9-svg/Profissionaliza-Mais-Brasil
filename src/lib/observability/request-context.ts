/**
 * AsyncLocalStorage para propagar contexto de request (requestId, tenantId,
 * userId, action) através de toda a call stack sem prop drilling.
 *
 * Por que não usar headers ou parâmetros:
 *   - Helpers em src/lib/* ficam isolados sem precisar receber `ctx`
 *   - Logger filho consulta automaticamente via contextLogger()
 *   - Funciona em Node.js runtime (que é onde rodam todos os webhooks/APIs)
 *
 * NÃO funciona em Edge runtime (middleware/proxy). Para esses, propague
 * manualmente ou use console direto.
 */
import { AsyncLocalStorage } from "node:async_hooks"
import { randomUUID } from "node:crypto"

export interface RequestContext {
  requestId: string
  tenantId?: string | null
  userId?: string | null
  action?: string
  route?: string
  // Metadata adicional específica do request (paymentId, enrollmentId, etc.)
  [key: string]: unknown
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Executa `fn` dentro de um escopo com contexto de request. Tudo que
 * rodar dentro (incluindo awaits) verá o contexto via getRequestContext().
 *
 * @example
 *   export async function POST(req: Request) {
 *     return runWithRequestContext(
 *       { action: "asaas.webhook", route: "/api/webhooks/asaas" },
 *       () => handle(req),
 *     )
 *   }
 */
export function runWithRequestContext<T>(
  ctx: Omit<RequestContext, "requestId"> & { requestId?: string },
  fn: () => T,
): T {
  const fullCtx: RequestContext = {
    requestId: ctx.requestId ?? randomUUID(),
    ...ctx,
  }
  return storage.run(fullCtx, fn)
}

/**
 * Retorna o contexto atual ou undefined se chamado fora de um escopo.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

/**
 * Anexa/atualiza campos no contexto atual. Útil quando descobrimos o
 * tenantId/userId apenas depois de uma query (ex: webhook resolve tenant
 * via paymentId).
 *
 * No-op se chamado fora de um runWithRequestContext.
 */
export function extendRequestContext(extra: Partial<RequestContext>): void {
  const ctx = storage.getStore()
  if (!ctx) return
  Object.assign(ctx, extra)
}
