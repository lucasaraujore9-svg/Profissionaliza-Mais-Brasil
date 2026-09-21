import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { handlePackageCoverUpload } from "@/lib/packages/cover-upload"
import { requireAdmin } from "@/lib/auth/admin-guard"

/* ------------------------------------------------------------------ */
/* POST — upload da capa de um plano da PMB (Supabase Storage)         */
/* Standalone: serve a criacao e a edicao do plano.                    */
/* ------------------------------------------------------------------ */
export const POST = withRequestContext(
  { action: "admin.assinaturas.capa_upload", route: "/api/admin/assinaturas/capa" },
  async (request: Request) => {
    const guard = await requireAdmin("assinaturas.manage")
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.upload)
    if (!rl.ok) return rateLimitResponse(rl)

    return handlePackageCoverUpload(request, {
      pathPrefix: "plans/pmb",
      allowedDeletePrefix: "plans/pmb/",
    })
  },
)
