import { withRequestContext } from "@/lib/observability/with-request-context"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { handlePackageCoverUpload } from "@/lib/packages/cover-upload"
import { requireAdmin } from "@/lib/auth/admin-guard"

/* ------------------------------------------------------------------ */
/* POST — upload da capa de um pacote da PMB (Supabase Storage)        */
/* Standalone: usado tanto na criacao quanto na edicao do pacote.     */
/* ------------------------------------------------------------------ */
export const POST = withRequestContext(
  { action: "admin.pacotes.capa_upload", route: "/api/admin/pacotes/capa" },
  async (request: Request) => {
    const guard = await requireAdmin("pacotes.manage")
    if (!guard.ok) return guard.response

    const rl = await rateLimit(request, RATE_LIMITS.upload)
    if (!rl.ok) return rateLimitResponse(rl)

    return handlePackageCoverUpload(request, {
      pathPrefix: "packages/pmb",
      allowedDeletePrefix: "packages/pmb/",
    })
  },
)
