import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { findTitularityCandidates } from "@/lib/students/titularity/signals"
import { prisma } from "@/lib/prisma"

/**
 * Fila de revisão de titularidade (/admin).
 *
 * Sem paginação e sem cursor de propósito: a base é de centenas de linhas
 * (230 alunos, 17 com certificado em ago/2026). Paginar aqui seria maquinaria
 * para um problema que não existe — e a fila encolhe conforme é trabalhada.
 */
export const GET = withRequestContext(
  { action: "admin.titularidade.list", route: "/api/admin/titularidade" },
  async (request: Request) => {
    const guard = await requireAdmin("alunosRede.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const url = new URL(request.url)
    const includeReviewed = url.searchParams.get("revisados") === "1"

    // Quem não alcança a rede inteira só vê a própria carteira. `unidadesWhere`
    // devolve `{}` para quem tem `unidades.viewAll` e `null` para quem não
    // alcança unidade nenhuma — nesse caso a fila fecha.
    const unidades = await ctx.unidadesWhere()
    if (unidades === null) {
      return NextResponse.json({ data: { candidates: [] } })
    }

    // Rede inteira: um scan só. Carteira: um scan por unidade alcançável.
    const tenantIds =
      Object.keys(unidades).length === 0
        ? [null]
        : (
            await prisma.tenant.findMany({
              where: unidades,
              select: { id: true },
            })
          ).map((t) => t.id)

    const batches = await Promise.all(
      tenantIds.map((tenantId) =>
        findTitularityCandidates({ tenantId, includeReviewed }),
      ),
    )
    const candidates = batches
      .flat()
      .sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome))

    return NextResponse.json({ data: { candidates } })
  },
)
