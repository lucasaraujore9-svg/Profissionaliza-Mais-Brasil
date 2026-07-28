import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { buildCsv, csvResponse } from "@/lib/reports/csv"
import {
  REPORT_DEFS,
  getReportRunner,
} from "@/lib/reports/definitions"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const dynamic = "force-dynamic"

export const GET = withRequestContextParams<{ type: string }>(
  { action: "admin.relatorios.generate", route: "/api/admin/relatorios/[type]" },
  async (request: Request, ctx) => {
  const guard = await requireAdmin("relatorios.export")
  if (!guard.ok) return guard.response
  const session = guard.ctx
  // `relatorios.export` decide QUEM exporta; aqui decidimos COM QUAL recorte.
  // Os runners são globais por natureza e só têm dois recortes modelados:
  //   vê a rede inteira (`unidades.viewAll`) -> tudo
  //   opera só a vitrine PMB                 -> só `pmbSalesAllowed`
  //   administra uma carteira de unidades    -> escopado por tenantId (abaixo)
  // Quem não se encaixa em nenhum exportaria dados fora do seu escopo.
  const seesAll = session.can("unidades.viewAll")
  const pmbOnly = !seesAll && session.can("alunos.view")
  const carteira = !seesAll && !pmbOnly && session.can("unidades.view")
  if (!seesAll && !pmbOnly && !carteira) {
    return NextResponse.json(
      { error: "Sem permissão para gerar relatórios" },
      { status: 403 },
    )
  }

  const { type } = await ctx.params
  const def = REPORT_DEFS.find((d) => d.id === type)
  if (!def) {
    return NextResponse.json({ error: "Relatório não encontrado" }, { status: 404 })
  }
  if (def.needsSuperAdmin && !seesAll) {
    return NextResponse.json(
      { error: "Apenas SUPER_ADMIN pode gerar este relatório" },
      { status: 403 },
    )
  }
  // PMB_SALES so gera relatorios self-escopados ao contexto PMB. Os demais
  // cobrem todos os tenants (dados de revendedores fora do escopo de PMB_SALES).
  if (pmbOnly && !def.pmbSalesAllowed) {
    return NextResponse.json(
      { error: "Sem permissão para este relatório" },
      { status: 403 },
    )
  }

  const runner = getReportRunner(type)
  if (!runner) {
    return NextResponse.json(
      { error: "Relatório sem implementação" },
      { status: 500 },
    )
  }

  const url = new URL(request.url)
  const format = (url.searchParams.get("format") ?? "csv").toLowerCase()
  const requestedTenantId = url.searchParams.get("tenantId") ?? undefined

  // PMB_RESELLER_MGR só pode filtrar por tenants atribuídos a ele.
  // Sem tenantId, força filtro implícito; com tenantId, valida ownership.
  const tenantId = requestedTenantId
  if (carteira) {
    if (requestedTenantId) {
      const t = await prisma.tenant.findUnique({
        where: { id: requestedTenantId },
        select: { accountManagerId: true, salesUserId: true },
      })
      if (!(await session.canAccessTenant(t))) {
        return NextResponse.json({ error: "Sem permissao para este tenant" }, { status: 403 })
      }
    } else {
      // Sem tenantId explícito: o report cobriria todos os tenants — bloqueia.
      return NextResponse.json(
        { error: "Informe tenantId — você só tem acesso aos seus tenants" },
        { status: 400 },
      )
    }
  }

  const filters = {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    tenantId,
  }

  try {
    const { header, rows, filename } = await runner.generate(filters)
    const dateStamp = new Date().toISOString().slice(0, 10)

    if (format === "json") {
      return NextResponse.json({
        data: {
          id: def.id,
          label: def.label,
          group: def.group,
          description: def.description,
          header,
          rows,
          filename: `${filename}-${dateStamp}`,
          totalRows: rows.length,
        },
      })
    }

    const csv = buildCsv(header, rows)
    return csvResponse(csv, `${filename}-${dateStamp}.csv`)
  } catch (error) {
    contextLogger().error(
      { err: error, event: "admin.relatorios.generate_failed" },
      "geração de relatório falhou",
    )
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha ao gerar relatório: ${message}` },
      { status: 500 },
    )
  }
  },
)
