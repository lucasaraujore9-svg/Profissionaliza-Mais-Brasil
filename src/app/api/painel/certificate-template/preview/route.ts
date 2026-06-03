import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { resolveCertificateTemplate } from "@/lib/certificates/template-resolver"
import { renderCertificateBuffer } from "@/lib/certificates/generate-pdf"
import { sampleCertificateFields } from "@/lib/certificates/sample"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const VALID_LAYOUTS = ["CLASSIC", "MODERN", "MINIMAL"] as const
type Layout = (typeof VALID_LAYOUTS)[number]

// Renderiza o PDF real do certificado com dados de EXEMPLO, usando o template
// resolvido da unidade (design herdado do PMB + logo da escola). Aceita
// ?layout= para o revendedor pré-visualizar qualquer um dos 3 modelos antes
// de salvar a escolha. Não persiste nada — é só preview.
export const GET = withRequestContext(
  { action: "painel.certificate_template.preview", route: "/api/painel/certificate-template/preview" },
  async (request: Request) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    const layoutParam = new URL(request.url).searchParams.get("layout")
    const layoutOverride = VALID_LAYOUTS.includes(layoutParam as Layout)
      ? (layoutParam as Layout)
      : null

    try {
      const [template, tenant] = await Promise.all([
        resolveCertificateTemplate(ctx.tenantId),
        prisma.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { name: true },
        }),
      ])

      const resolved = layoutOverride
        ? { ...template, layout: layoutOverride }
        : template

      const fields = sampleCertificateFields(tenant?.name ?? "Sua Escola")
      const buffer = await renderCertificateBuffer(resolved, fields)

      return new NextResponse(buffer as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="previa-certificado.pdf"',
          "Cache-Control": "private, no-store",
        },
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "painel.certificate_template.preview_failed", tenantId: ctx.tenantId },
        "falha ao gerar prévia em PDF do certificado",
      )
      return NextResponse.json({ error: "Falha ao gerar prévia" }, { status: 500 })
    }
  },
)
