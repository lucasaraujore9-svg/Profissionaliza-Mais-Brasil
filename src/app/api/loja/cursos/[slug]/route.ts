import { NextResponse } from "next/server"
import { getTenantCourseBySlug } from "@/lib/tenant/courses"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const GET = withRequestContextParams<{ slug: string }>(
  { action: "loja.cursos.get", route: "/api/loja/cursos/[slug]" },
  async (request: Request, ctx) => {
  const tenantId = request.headers.get("x-tenant-id")

  if (!tenantId) {
    return NextResponse.json(
      { error: "Tenant não identificado", code: "TENANT_MISSING" },
      { status: 400 },
    )
  }

  const { slug } = await ctx.params

  if (!slug || slug.length < 1) {
    return NextResponse.json(
      { error: "Slug inválido", code: "INVALID_SLUG" },
      { status: 400 },
    )
  }

  const course = await getTenantCourseBySlug(tenantId, slug)

  if (!course) {
    return NextResponse.json(
      { error: "Curso não encontrado", code: "NOT_FOUND" },
      { status: 404 },
    )
  }

  return NextResponse.json({ data: course })
  },
)
