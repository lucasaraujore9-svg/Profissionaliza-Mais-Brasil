import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Lote para nao estourar o pool do Supabase nem o Storage em paralelo.
const BATCH = 4

// PERF-006: teto de certificados por request + cursor keyset (?afterId=<certId>)
// para retomar. Sem isto, milhares de PDFs num único request estouram os 300s e
// uma falha/timeout perde TODO o progresso (cada PDF é idempotente por
// sobrescrita, mas não havia ponto de retomada). O client itera até nextAfterId
// = null. Ordena por `id` asc (chave estável do cursor).
const PAGE_SIZE = 200

/**
 * Regenera o PDF de TODOS os certificados ja emitidos (pdfUrl != null e nao
 * revogados), aplicando o estado atual de templates/branding — variaveis em
 * MAIUSCULO, percentual de conclusao na frente, QR com cartao branco e a
 * pagina 2 (fundamentacao legal). Idempotente: sobrescreve cada objeto no
 * Storage pelo id do certificado.
 *
 * SUPER_ADMIN-only: percorre todos os tenants (operacao global de manutencao).
 * Roda no servidor (Vercel), onde os segredos de producao estao injetados.
 */
export const POST = withRequestContext(
  { action: "admin.certificates.regenerate_all", route: "/api/admin/certificates/regenerate-all" },
  async (request: Request) => {
    // Aceita SUPER_ADMIN (botão no admin) OU CRON_SECRET (gatilho de
    // manutenção server-to-server, ex: ops/automação). Ambos são privilegiados.
    if (!isCronAuthorized(request)) {
      const ctx = await requireAdminSession()
      if (!ctx) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
      }
      if (ctx.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
      }
    }

    const log = contextLogger()
    const url = new URL(request.url)
    const afterId = url.searchParams.get("afterId") || undefined
    const certs = await prisma.certificate.findMany({
      where: {
        pdfUrl: { not: null },
        revokedAt: null,
        ...(afterId ? { id: { gt: afterId } } : {}),
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
    })

    let ok = 0
    const failures: { id: string; error: string }[] = []

    for (let i = 0; i < certs.length; i += BATCH) {
      const batch = certs.slice(i, i + BATCH)
      const results = await Promise.allSettled(
        batch.map((c) => generateAndUploadPdf(c.id)),
      )
      results.forEach((r, j) => {
        if (r.status === "fulfilled") {
          ok++
        } else {
          const error = String(
            (r.reason as { message?: string })?.message ?? r.reason,
          )
          failures.push({ id: batch[j].id, error })
        }
      })
    }

    // Cursor de retomada: página cheia => há mais; página parcial => acabou.
    const nextAfterId =
      certs.length === PAGE_SIZE ? certs[certs.length - 1].id : null

    log.info(
      {
        event: "certificates.regenerate_all",
        count: certs.length,
        ok,
        failures: failures.length,
        hasMore: nextAfterId != null,
      },
      "regeneração em lote de certificados — página concluída",
    )

    return NextResponse.json({
      count: certs.length,
      regenerated: ok,
      failed: failures.length,
      failures,
      nextAfterId,
    })
  },
)
