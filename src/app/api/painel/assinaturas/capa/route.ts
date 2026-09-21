import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { handlePackageCoverUpload } from "@/lib/packages/cover-upload"
import { requireSubscriptionModule } from "@/lib/subscriptions/module-gate"

/* ------------------------------------------------------------------ */
/* POST — upload da capa de um plano proprio da revenda                */
/* Standalone: serve a criacao e a edicao do plano (a URL volta pro    */
/* form e e salva no submit), igual ao upload de capa de pacote.       */
/* ------------------------------------------------------------------ */
export const POST = withRequestContext(
  { action: "painel.assinaturas.capa_upload", route: "/api/painel/assinaturas/capa" },
  async (request: Request) => {
    const guard = await requireSubscriptionModule("assinaturas.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const rl = await rateLimit(request, RATE_LIMITS.upload)
    if (!rl.ok) return rateLimitResponse(rl)

    // Assets isolados por tenant — `{tenantId}/plans/...` — e o tenant so pode
    // apagar capas sob o proprio prefixo (defesa contra `previousUrl` forjado).
    return handlePackageCoverUpload(request, {
      pathPrefix: `${ctx.tenantId}/plans`,
      allowedDeletePrefix: `${ctx.tenantId}/`,
    })
  },
)
