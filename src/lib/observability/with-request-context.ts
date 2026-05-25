/**
 * Wrapper para handlers de Route Handler (Next.js App Router) que cria
 * automaticamente um RequestContext com requestId derivado de header
 * (`x-request-id`) ou gerado.
 *
 * Uso:
 *   export const POST = withRequestContext(
 *     { action: "loja.checkout", route: "/api/loja/checkout" },
 *     async (req, ctx) => { ... }
 *   )
 *
 * Para handlers com params dinâmicos (e.g. [id]):
 *   export const GET = withRequestContextParams<{ id: string }>(
 *     { action: "admin.aluno.get" },
 *     async (req, { params }) => { ... }
 *   )
 */
import { runWithRequestContext } from "@/lib/observability/request-context"

type RouteCtx<P extends Record<string, string> = Record<string, never>> = {
  params: Promise<P>
}

type Handler = (req: Request) => Promise<Response> | Response

type HandlerWithParams<P extends Record<string, string>> = (
  req: Request,
  ctx: RouteCtx<P>,
) => Promise<Response> | Response

interface BaseContext {
  action: string
  route?: string
}

function pickRequestId(req: Request): string | undefined {
  return (
    req.headers.get("x-request-id") ??
    req.headers.get("x-vercel-id") ??
    undefined
  )
}

export function withRequestContext(ctx: BaseContext, handler: Handler): Handler {
  return (req: Request) =>
    runWithRequestContext(
      { ...ctx, requestId: pickRequestId(req) },
      () => handler(req),
    )
}

export function withRequestContextParams<P extends Record<string, string>>(
  ctx: BaseContext,
  handler: HandlerWithParams<P>,
): HandlerWithParams<P> {
  return (req: Request, routeCtx: RouteCtx<P>) =>
    runWithRequestContext(
      { ...ctx, requestId: pickRequestId(req) },
      () => handler(req, routeCtx),
    )
}
