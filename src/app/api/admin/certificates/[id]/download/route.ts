import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  adminCanAccessCertTenant,
  certScopeDeniedResponse,
} from "@/lib/certificates/admin-scope"
import { ensureFreshCertificatePdf } from "@/lib/certificates/freshness"
import {
  downloadCertificatePdf,
  extractCertificatePath,
} from "@/lib/certificates/storage"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Stream do PDF via service-role (funciona com bucket público OU privado).
// Substitui o link direto à URL pública permanente do Storage (R1/R12).
export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.certificates.download", route: "/api/admin/certificates/[id]/download" },
  async (request: Request, { params }) => {
    const guard = await requireAdmin("certificados.view")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx

    // ?inline=1 exibe o PDF no navegador (visualizar); padrão é baixar (attachment).
    const inline = new URL(request.url).searchParams.get("inline") === "1"
    const { id } = await params
    const cert = await prisma.certificate.findUnique({ where: { id } })
    if (!cert) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 })
    }
    // Escopo por papel: o PDF contem nome + CPF do aluno (PII). Sem isto,
    // qualquer membro PMB baixaria o certificado de qualquer revendedor por id.
    if (!(await adminCanAccessCertTenant(ctx, cert.tenantId))) {
      return certScopeDeniedResponse()
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
        { err, event: "admin.certificates.download_bucket_failed", certificateId: cert.id, path },
        "falha ao baixar PDF do bucket privado",
      )
      return NextResponse.json(
        { error: "Falha ao recuperar o PDF. Tente novamente." },
        { status: 502 },
      )
    }
  },
)
