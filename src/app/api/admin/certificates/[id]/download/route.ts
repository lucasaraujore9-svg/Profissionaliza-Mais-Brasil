import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { generateAndUploadPdf } from "@/lib/certificates/generate-pdf"
import {
  downloadCertificatePdf,
  extractCertificatePath,
} from "@/lib/certificates/storage"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Stream do PDF via service-role (funciona com bucket público OU privado).
// Substitui o link direto à URL pública permanente do Storage (R1/R12).
export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.certificates.download", route: "/api/admin/certificates/[id]/download" },
  async (_request: Request, { params }) => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const { id } = await params
    const cert = await prisma.certificate.findUnique({ where: { id } })
    if (!cert) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
    }
    if (cert.revokedAt) {
      return NextResponse.json({ error: "Certificado revogado" }, { status: 410 })
    }

    let pdfUrl = cert.pdfUrl
    if (!pdfUrl) {
      try {
        pdfUrl = (await generateAndUploadPdf(cert.id)).pdfUrl
      } catch (err) {
        contextLogger().error(
          { err, event: "admin.certificates.pdf_gen_failed", certificateId: cert.id },
          "falha ao gerar PDF do certificado",
        )
        return NextResponse.json({ error: "Falha ao gerar PDF" }, { status: 500 })
      }
    }
    if (!pdfUrl) {
      return NextResponse.json({ error: "Certificado sem PDF" }, { status: 500 })
    }

    const path = extractCertificatePath(pdfUrl)
    if (path) {
      try {
        const buffer = await downloadCertificatePdf(path)
        const safeCode = String(cert.code).replace(/[^A-Za-z0-9_-]/g, "")
        return new NextResponse(buffer as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="certificado-${safeCode}.pdf"`,
            "Cache-Control": "private, no-store",
          },
        })
      } catch (err) {
        contextLogger().error(
          { err, event: "admin.certificates.download_bucket_failed", certificateId: cert.id, path },
          "falha ao baixar PDF do bucket — fallback pra URL armazenada",
        )
        // fallback: enquanto o bucket é público, a URL ainda resolve.
      }
    }
    return NextResponse.redirect(pdfUrl, { status: 302 })
  },
)
