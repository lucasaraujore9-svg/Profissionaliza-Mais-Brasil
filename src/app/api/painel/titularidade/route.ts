import { NextResponse } from "next/server"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { findTitularityCandidates } from "@/lib/students/titularity/signals"

/** Fila de revisão de titularidade da própria unidade. */
export const GET = withRequestContext(
  { action: "painel.titularidade.list", route: "/api/painel/titularidade" },
  async (request: Request) => {
    const guard = await requirePainel("alunos.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const url = new URL(request.url)
    const includeReviewed = url.searchParams.get("revisados") === "1"

    const candidates = await findTitularityCandidates({
      // Isolamento P0: a unidade só enxerga os próprios alunos.
      tenantId: ctx.tenantId,
      // Recorte de carteira: sem `alunos.viewAll`, a pessoa só vê os alunos que
      // ela originou — mesmo filtro das demais rotas /api/painel/alunos*.
      scopeWhere: ctx.scope.alunos,
      includeReviewed,
    })

    return NextResponse.json({ data: { candidates } })
  },
)
