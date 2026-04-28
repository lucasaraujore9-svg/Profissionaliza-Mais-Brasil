import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { syncCatalogFromEA } from "@/lib/catalog/sync"

// Sync com 120+ cursos pode passar dos 10s default da Vercel.
export const maxDuration = 60

export async function POST() {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  try {
    const result = await syncCatalogFromEA("manual")
    return NextResponse.json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha ao sincronizar catálogo: ${message}` },
      { status: 502 },
    )
  }
}
