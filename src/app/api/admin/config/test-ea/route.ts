import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { listarCursos } from "@/lib/escola-avancada/client"
import { EAApiError, EANetworkError } from "@/lib/escola-avancada/errors"

export async function POST() {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const cursos = await listarCursos()
    return NextResponse.json({
      data: {
        status: "success",
        message: `Conexão OK. ${cursos.length} cursos disponíveis na EA.`,
        durationMs: Date.now() - startedAt,
      },
    })
  } catch (err) {
    const message =
      err instanceof EAApiError
        ? err.apiError ?? err.message
        : err instanceof EANetworkError
        ? err.message
        : "Erro desconhecido ao testar EA"
    return NextResponse.json({
      data: {
        status: "error",
        message,
        durationMs: Date.now() - startedAt,
      },
    })
  }
}
