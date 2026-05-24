import { NextResponse } from "next/server"
import { syncCatalogFromEA } from "@/lib/catalog/sync"
import { isCronAuthorized } from "@/lib/auth/bearer"

export const maxDuration = 300

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  try {
    const result = await syncCatalogFromEA("cron")
    return NextResponse.json({ data: result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json(
      { error: `Falha ao sincronizar catálogo: ${message}` },
      { status: 502 },
    )
  }
}

export async function GET(request: Request) {
  return POST(request)
}
