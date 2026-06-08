import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Eventos de navegacao anonimos (nunca convertidos em lead) sao descartaveis
// apos esta janela. Eventos JA vinculados a um lead (leadId != null) sao
// preservados — fazem parte da timeline permanente do CRM.
const RETENTION_DAYS = 90
// Apaga em lotes para nao segurar locks longos em tabelas grandes.
const BATCH_SIZE = 5_000

/**
 * Limpeza periodica de VisitorEvent anonimos antigos. Mantem a tabela enxuta
 * dado o volume de page views ("todas as paginas" da vitrine). Idempotente.
 */
async function process() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
  let deleted = 0

  // Loop em lotes ate esgotar os candidatos.
  for (;;) {
    const batch = await prisma.visitorEvent.findMany({
      where: { leadId: null, createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    })
    if (batch.length === 0) break

    const res = await prisma.visitorEvent.deleteMany({
      where: { id: { in: batch.map((e) => e.id) } },
    })
    deleted += res.count
    if (batch.length < BATCH_SIZE) break
  }

  return { deleted, retentionDays: RETENTION_DAYS }
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  try {
    const result = await process()
    return NextResponse.json({ data: result })
  } catch (err) {
    contextLogger().error(
      { err, event: "cron.sweep_visitor_events.failed" },
      "Falha ao limpar VisitorEvent antigos",
    )
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
