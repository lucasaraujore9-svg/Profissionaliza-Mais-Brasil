import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { syncCatalogFromEA } from "@/lib/catalog/sync"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Sync com 120+ cursos pode passar dos 10s default da Vercel.
export const maxDuration = 60

export const POST = withRequestContext(
  { action: "admin.catalogo.sync", route: "/api/admin/catalogo/sync" },
  async () => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  // Sync muta o catalogo GLOBAL (precos, categorias, status, HomeSections).
  // Consistente com catalogo/[id], catalogo/categorias e system-settings,
  // que sao SUPER_ADMIN-only.
  if (ctx.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }

  try {
    const result = await syncCatalogFromEA("manual")
    return NextResponse.json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha ao sincronizar catálogo: ${message}` },
      { status: 502 },
    )
  }
  },
)
