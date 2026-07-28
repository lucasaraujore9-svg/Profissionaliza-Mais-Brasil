import { NextResponse } from "next/server"
import { AsaasApiError } from "@/lib/asaas/client"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContext(
  { action: "admin.config.test_asaas", route: "/api/admin/config/test-asaas" },
  async () => {
  const guard = await requireAdmin("integracoes.manage")
  if (!guard.ok) return guard.response

  const apiUrl = process.env.ASAAS_API_URL
  const apiKey = process.env.ASAAS_API_KEY
  if (!apiUrl || !apiKey) {
    return NextResponse.json({
      data: {
        status: "error",
        message: "ASAAS_API_URL ou ASAAS_API_KEY não configurados",
        durationMs: 0,
      },
    })
  }

  const startedAt = Date.now()
  try {
    const url = `${apiUrl.replace(/\/$/, "")}/customers?limit=1`
    const res = await fetch(url, {
      method: "GET",
      headers: { access_token: apiKey, "Content-Type": "application/json" },
    })

    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new AsaasApiError(
        err?.errors?.[0]?.description ?? `HTTP ${res.status}`,
        res.status,
      )
    }

    const body = (await res.json()) as { totalCount?: number }
    return NextResponse.json({
      data: {
        status: "success",
        message: `Conexão OK. ${body.totalCount ?? 0} clientes cadastrados.`,
        durationMs: Date.now() - startedAt,
      },
    })
  } catch (err) {
    const message =
      err instanceof AsaasApiError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Erro desconhecido ao testar Asaas"
    return NextResponse.json({
      data: {
        status: "error",
        message,
        durationMs: Date.now() - startedAt,
      },
    })
  }
  },
)
