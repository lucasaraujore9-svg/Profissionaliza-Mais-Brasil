import { NextResponse } from "next/server"
import { syncAllCatalogs } from "@/lib/catalog/sync-all"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Sync de 120+ cursos em DUAS plataformas (EA + LMS) pode passar dos 10s default.
export const maxDuration = 120

export const POST = withRequestContext(
  { action: "admin.catalogo.sync", route: "/api/admin/catalogo/sync" },
  async () => {
  const guard = await requireAdmin("catalogo.sync")
  if (!guard.ok) return guard.response
  // Sync muta o catalogo GLOBAL (precos, categorias, status, HomeSections).
  // Consistente com catalogo/[id], catalogo/categorias e system-settings,
  // que sao SUPER_ADMIN-only.
  // Sincroniza TODAS as fornecedoras (EA + LMS), tolerando falha parcial.
  const result = await syncAllCatalogs("manual")

  // Falha TOTAL (nenhuma plataforma rodou) → 502. Sucesso/parcial → 200 com
  // `errors` no corpo (o front mostra os contadores + o aviso da que falhou).
  if (result.byProvider.length > 0 && result.byProvider.every((p) => !p.ok)) {
    return NextResponse.json(
      {
        error: `Falha ao sincronizar catálogo: ${result.errors.map((e) => `${e.provider}: ${e.message}`).join(" · ")}`,
        data: result,
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ data: result })
  },
)
