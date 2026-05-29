import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Regera o PDF do certificado a partir do estado atual (templates/branding).
// Escopo por tenant: revendedor só regenera certificados da própria loja.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "painel.certificates.regenerate", route: "/api/painel/certificates/[id]/regenerate" },
  async (_request: Request, { params }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

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

    try {
      const { pdfUrl } = await generateAndUploadPdf(cert.id)
      return NextResponse.json({ data: { pdfUrl } })
    } catch (err) {
      contextLogger().error(
        { err, event: "painel.certificates.regenerate_failed", certificateId: cert.id },
        "falha ao regenerar PDF do certificado",
      )
      return NextResponse.json({ error: "Falha ao regenerar PDF" }, { status: 500 })
    }
  },
)
