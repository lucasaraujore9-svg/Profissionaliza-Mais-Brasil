import { NextResponse } from "next/server"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { requireResellerOwner } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { getTenantBillingSummary } from "@/lib/tenant-billing/charges"

export const dynamic = "force-dynamic"

/**
 * Cobranças que a unidade paga para a PMB. Alimenta o pop-up de vencimento e a
 * atualização da tela /painel/cobrancas.
 *
 * OWNER-ONLY: é o financeiro da própria unidade. Consultor (TenantMember)
 * também carrega `tenantId` na sessão, então a checagem de dono é obrigatória —
 * a mesma razão pela qual `tenant-billing` é owner-only nas notificações.
 */
export const GET = withRequestContext(
  { action: "painel.cobrancas.list", route: "/api/painel/cobrancas" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const guard = await requireResellerOwner(ctx.tenantId)
    if (!guard.ok) return guard.response

    const { searchParams } = new URL(request.url)
    const historyLimit = searchParams.get("history") === "0" ? 0 : 24

    const summary = await getTenantBillingSummary(ctx.tenantId, { historyLimit })
    return NextResponse.json({ data: summary })
  },
)
