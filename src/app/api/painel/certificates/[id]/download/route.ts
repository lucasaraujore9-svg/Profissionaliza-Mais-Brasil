import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ensureFreshCertificatePdf } from "@/lib/certificates/freshness"
import {
  downloadCertificatePdf,
  extractCertificatePath,
} from "@/lib/certificates/storage"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Stream do PDF via service-role (funciona com bucket público OU privado).
// Escopo por tenant: revendedor só baixa certificados da própria loja.
export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.certificates.download", route: "/api/painel/certificates/[id]/download" },
  async (request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // ?inline=1 exibe o PDF no navegador (visualizar); padrão é baixar (attachment).
    const inline = new URL(request.url).searchParams.get("inline") === "1"
    const { id } = await params
    const cert = await prisma.certificate.findUnique({ where: { id } })
    if (!cert) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
    }
    if (cert.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
    }
    if (cert.revokedAt) {
      return NextResponse.json({ error: "Certificado revogado" }, { status: 410 })
    }

    // Regenera on-demand se nunca foi gerado ou se o template/branding mudou
    // depois da geracao — trocar o modelo passa a refletir no download.
    const pdfUrl = await ensureFreshCertificatePdf(cert)
    if (!pdfUrl) {
      return NextResponse.json({ error: "Falha ao gerar PDF" }, { status: 500 })
    }

    // Bucket `certificates` é PRIVADO (R1): stream SEMPRE via service-role.
    // Nunca redireciona para a URL pública (agora 400 + exporia PII no path).
    const path = extractCertificatePath(pdfUrl)
    if (!path) {
      return NextResponse.json({ error: "Falha ao gerar PDF" }, { status: 500 })
    }
    try {
      const buffer = await downloadCertificatePdf(path)
      const safeCode = String(cert.code).replace(/[^A-Za-z0-9_-]/g, "")
      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="certificado-${safeCode}.pdf"`,
          "Cache-Control": "private, no-store",
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "painel.certificates.download_bucket_failed", certificateId: cert.id, path },
        "falha ao baixar PDF do bucket privado",
      )
      return NextResponse.json(
        { error: "Falha ao recuperar o PDF. Tente novamente." },
        { status: 502 },
      )
    }
  },
)
