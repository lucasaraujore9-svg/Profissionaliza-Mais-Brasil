import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Lote para nao estourar o pool do Supabase nem o Storage em paralelo.
const BATCH = 4

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
  async () => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (ctx.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const log = contextLogger()
    const certs = await prisma.certificate.findMany({
      where: { pdfUrl: { not: null }, revokedAt: null },
      select: { id: true },
      orderBy: { createdAt: "asc" },
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

    log.info(
      {
        event: "certificates.regenerate_all",
        total: certs.length,
        ok,
        failures: failures.length,
      },
      "regeneração em lote de certificados concluída",
    )

    return NextResponse.json({
      total: certs.length,
      regenerated: ok,
      failed: failures.length,
      failures,
    })
  },
)
