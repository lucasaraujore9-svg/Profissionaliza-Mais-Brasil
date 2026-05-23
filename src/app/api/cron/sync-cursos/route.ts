import { NextResponse } from "next/server"
import { syncCatalogFromEA } from "@/lib/catalog/sync"

export const maxDuration = 300

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header
  return bearer === secret
}

export async function POST(request: Request) {
  if (!authorized(request)) {
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
