import { NextResponse } from "next/server"
import { listarCursos } from "@/lib/plataforma-cursos/client"
import { EAApiError, EANetworkError } from "@/lib/plataforma-cursos/errors"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const POST = withRequestContext(
  { action: "admin.config.test_plataforma", route: "/api/admin/config/test-plataforma" },
  async () => {
  const guard = await requireAdmin("integracoes.manage")
  if (!guard.ok) return guard.response

  const startedAt = Date.now()
  try {
    const cursos = await listarCursos()
    return NextResponse.json({
      data: {
        status: "success",
        message: `Conexão OK. ${cursos.length} cursos disponíveis no catálogo.`,
        durationMs: Date.now() - startedAt,
      },
    })
  } catch (err) {
    const message =
      err instanceof EAApiError
        ? err.apiError ?? err.message
        : err instanceof EANetworkError
        ? err.message
        : "Erro desconhecido ao testar a plataforma de aulas"
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
