import { NextResponse } from "next/server"
import { z } from "zod"
import { getCurrentTenant } from "@/lib/tenant/current"
import { loadCatalogo } from "@/lib/catalog/home"
import { listTenantCatalog } from "@/lib/tenant/courses"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"

const MAX_SUGGESTIONS = 8

const querySchema = z.object({
  q: z.string().trim().min(1).max(80),
})

export interface CourseSuggestion {
  slug: string
  nome: string
  categoria: string | null
}

/**
 * Sugestões de cursos para o autocomplete das buscas públicas (hero, navbar
 * e página /cursos). Tenant-aware: em domínio de unidade retorna o catálogo
 * da unidade (preço/visibilidade dela); no site PMB, o catálogo institucional.
 */
export const GET = withRequestContext(
  { action: "catalogo.sugestoes", route: "/api/catalogo/sugestoes" },
  async (request: Request) => {
    const { searchParams } = new URL(request.url)
    const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? "" })
    if (!parsed.success) {
      return NextResponse.json({ data: [] })
    }
    const q = parsed.data.q

    const tenant = await getCurrentTenant()

    let data: CourseSuggestion[]
    if (tenant) {
      const { items } = await listTenantCatalog({ tenantId: tenant.id, search: q })
      data = items.slice(0, MAX_SUGGESTIONS).map((i) => ({
        slug: i.slug,
        nome: i.nome,
        categoria: i.categoria ?? null,
      }))
    } else {
      const { cursos } = await loadCatalogo({ q, take: MAX_SUGGESTIONS })
      data = cursos.map((c) => ({
        slug: c.slug,
        nome: c.titulo,
        categoria: c.categoria ?? null,
      }))
    }

    return NextResponse.json({ data })
  },
)
