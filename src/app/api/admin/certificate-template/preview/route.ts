import { NextResponse } from "next/server"
import { z } from "zod"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { PMB_PUBLIC_NAME } from "@/lib/pmb-config"
import {
  refreshGroupBranding,
  type ResolvedTemplate,
} from "@/lib/certificates/template-resolver"
import { renderCertificateBuffer } from "@/lib/certificates/generate-pdf"
import { sampleCertificateFields } from "@/lib/certificates/sample"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor inválida (use formato hex)")

// Aceita o template que está sendo editado no formulário (mesmo sem salvar).
// Campos opcionais para tolerar previews de estados parciais.
const previewSchema = z.object({
  layout: z.enum(["CLASSIC", "MODERN", "MINIMAL"]),
  backgroundUrl: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  sealUrl: z.string().url().nullable().optional(),
  signatureUrl: z.string().url().nullable().optional(),
  primaryColor: hexColor.nullable().optional(),
  secondaryColor: hexColor.nullable().optional(),
  titleText: z.string().trim().min(1).max(160),
  bodyText: z.string().trim().min(1).max(2000),
  footerText: z.string().trim().max(500).nullable().optional(),
  signerName: z.string().trim().max(160).nullable().optional(),
  signerTitle: z.string().trim().max(160).nullable().optional(),
  showQrCode: z.boolean(),
  showValidationUrl: z.boolean(),
  showSeal: z.boolean(),
  isActive: z.boolean().optional(),
})

const DEFAULT_PRIMARY = "#16653f"
const DEFAULT_SECONDARY = "#0f3d24"

// Renderiza o PDF real do template padrão PMB a partir do estado ATUAL do
// formulário (não persistido), com dados de exemplo. Permite ao admin ver o
// resultado exato das edições antes de salvar.
export const POST = withRequestContext(
  { action: "admin.certificate_template.preview", route: "/api/admin/certificate-template/preview" },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = previewSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const d = parsed.data

    try {
      // Branding do grupo (logo + nome) sempre do SystemSettings atual.
      const template: ResolvedTemplate = await refreshGroupBranding({
        layout: d.layout,
        backgroundUrl: d.backgroundUrl ?? null,
        logoUrl: d.logoUrl ?? null,
        sealUrl: d.sealUrl ?? null,
        signatureUrl: d.signatureUrl ?? null,
        primaryColor: d.primaryColor ?? DEFAULT_PRIMARY,
        secondaryColor: d.secondaryColor ?? DEFAULT_SECONDARY,
        titleText: d.titleText,
        bodyText: d.bodyText,
        footerText: d.footerText ?? null,
        signerName: d.signerName ?? null,
        signerTitle: d.signerTitle ?? null,
        showQrCode: d.showQrCode,
        showValidationUrl: d.showValidationUrl,
        showSeal: d.showSeal,
        groupLogoUrl: null,
        groupName: "Grupo Bolsa Mais Brasil",
      })

      const fields = sampleCertificateFields(PMB_PUBLIC_NAME)
      const buffer = await renderCertificateBuffer(template, fields)

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
        { err, event: "admin.certificate_template.preview_failed" },
        "falha ao gerar prévia em PDF do template de certificado",
      )
      return NextResponse.json({ error: "Falha ao gerar prévia" }, { status: 500 })
    }
  },
)
