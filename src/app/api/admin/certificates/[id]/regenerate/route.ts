import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  adminCanAccessCertTenant,
  certScopeDeniedResponse,
} from "@/lib/certificates/admin-scope"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Regera o PDF do certificado a partir do estado atual (templates/branding).
// Sobrescreve o objeto no Storage (idempotente). Útil após correções de layout
// ou troca de logo do grupo — atualiza certificados já emitidos.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.certificates.regenerate", route: "/api/admin/certificates/[id]/regenerate" },
  async (_request: Request, { params }) => {
    const guard = await requireAdmin("certificados.manage")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx

    const { id } = await params
    const cert = await prisma.certificate.findUnique({ where: { id } })
    if (!cert) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
    }
    // Escopo por papel: regenerar sobrescreve o PDF no Storage (mutacao). Sem
    // isto, qualquer membro PMB regeneraria certificados de qualquer revendedor.
    if (!(await adminCanAccessCertTenant(ctx, cert.tenantId))) {
      return certScopeDeniedResponse()
    }
    if (cert.revokedAt) {
      return NextResponse.json({ error: "Certificado revogado" }, { status: 410 })
    }

    try {
      const { pdfUrl } = await generateAndUploadPdf(cert.id)
      return NextResponse.json({ data: { pdfUrl } })
    } catch (err) {
      contextLogger().error(
        { err, event: "admin.certificates.regenerate_failed", certificateId: cert.id },
        "falha ao regenerar PDF do certificado",
      )
      return NextResponse.json({ error: "Falha ao regenerar PDF" }, { status: 500 })
    }
  },
)
