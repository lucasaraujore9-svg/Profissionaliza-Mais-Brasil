import { NextResponse } from "next/server"
import { syncCatalogFromLMS } from "@/lib/catalog/sync-lms"
import { isCronAuthorized } from "@/lib/auth/bearer"

export const maxDuration = 300

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const result = await syncCatalogFromLMS("cron")
    return NextResponse.json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha ao sincronizar catálogo LMS: ${message}` },
      { status: 502 },
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
