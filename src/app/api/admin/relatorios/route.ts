import { NextResponse } from "next/server"
import { REPORT_DEFS } from "@/lib/reports/definitions"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.relatorios.list", route: "/api/admin/relatorios" },
  async () => {
  const guard = await requireAdmin("relatorios.export")
  if (!guard.ok) return guard.response
  const session = guard.ctx
  // Os runners de CSV só têm recorte modelado para dois perfis de escopo: quem
  // opera a vitrine PMB (`alunos.view` sem `unidades.viewAll`) e quem administra
  // uma carteira de unidades. Quem não se encaixa em nenhum e também não vê a
  // rede inteira receberia dados fora do seu escopo — devolve lista vazia.
  const seesAll = session.can("unidades.viewAll")
  const pmbOnly = !seesAll && session.can("alunos.view")
  const carteira = !seesAll && session.can("unidades.view")
  if (!seesAll && !pmbOnly && !carteira) {
    return NextResponse.json({ data: { reports: [], role: session.role } })
  }

  const reports = REPORT_DEFS.filter(
    (r) =>
      // needsSuperAdmin → só quem enxerga o ecossistema inteiro
      (!r.needsSuperAdmin || seesAll) &&
      // quem só opera a vitrine PMB fica nos relatórios B2C
      (!pmbOnly || r.pmbSalesAllowed),
  ).map((r) => ({
    id: r.id,
    group: r.group,
    label: r.label,
    description: r.description,
  }))

  return NextResponse.json({ data: { reports, role: session.role } })
  },
)
