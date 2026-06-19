import { NextResponse } from "next/server"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { handlePackageCoverUpload } from "@/lib/packages/cover-upload"

/* ------------------------------------------------------------------ */
/* POST — upload da capa de um pacote proprio da revenda              */
/* Standalone: usado tanto na criacao quanto na edicao do pacote.     */
/* ------------------------------------------------------------------ */
export const POST = withRequestContext(
  { action: "painel.pacotes.capa_upload", route: "/api/painel/pacotes/capa" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const rl = await rateLimit(request, RATE_LIMITS.upload)
    if (!rl.ok) return rateLimitResponse(rl)

    // Assets isolados por tenant — `{tenantId}/packages/...` — e o tenant so
    // pode apagar capas sob o proprio prefixo.
    return handlePackageCoverUpload(request, {
      pathPrefix: `${ctx.tenantId}/packages`,
      allowedDeletePrefix: `${ctx.tenantId}/`,
    })
  },
)
