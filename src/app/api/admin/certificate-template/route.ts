import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const layoutEnum = z.enum(["CLASSIC", "MODERN", "MINIMAL"])

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor inválida (use formato hex)")

const upsertSchema = z.object({
  layout: layoutEnum,
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

export const GET = withRequestContext(
  { action: "admin.certificate_template.get", route: "/api/admin/certificate-template" },
  async () => {
  const guard = await requireAdmin("certificados.view")
  if (!guard.ok) return guard.response

  const template = await prisma.certificateTemplate.findFirst({
    where: { tenantId: null },
  })

  return NextResponse.json({
    data: template
      ? {
          id: template.id,
          tenantId: null,
          layout: template.layout,
          backgroundUrl: template.backgroundUrl,
          logoUrl: template.logoUrl,
          sealUrl: template.sealUrl,
          signatureUrl: template.signatureUrl,
          primaryColor: template.primaryColor,
          secondaryColor: template.secondaryColor,
          titleText: template.titleText,
          bodyText: template.bodyText,
          footerText: template.footerText,
          signerName: template.signerName,
          signerTitle: template.signerTitle,
          showQrCode: template.showQrCode,
          showValidationUrl: template.showValidationUrl,
          showSeal: template.showSeal,
          isActive: template.isActive,
        }
      : null,
  })
  },
)

export const PUT = withRequestContext(
  { action: "admin.certificate_template.upsert", route: "/api/admin/certificate-template" },
  async (request: Request) => {
  const guard = await requireAdmin("certificados.template")
  if (!guard.ok) return guard.response

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = upsertSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const data = parsed.data

  // tenantId=null não é unique no schema (a constraint @@unique não trata null no Postgres
  // do mesmo jeito que valores), então fazemos findFirst + create/update manual.
  const existing = await prisma.certificateTemplate.findFirst({
    where: { tenantId: null },
    select: { id: true },
  })

  const template = existing
    ? await prisma.certificateTemplate.update({
        where: { id: existing.id },
        data: {
          layout: data.layout,
          backgroundUrl: data.backgroundUrl ?? null,
          logoUrl: data.logoUrl ?? null,
          sealUrl: data.sealUrl ?? null,
          signatureUrl: data.signatureUrl ?? null,
          primaryColor: data.primaryColor ?? null,
          secondaryColor: data.secondaryColor ?? null,
          titleText: data.titleText,
          bodyText: data.bodyText,
          footerText: data.footerText ?? null,
          signerName: data.signerName ?? null,
          signerTitle: data.signerTitle ?? null,
          showQrCode: data.showQrCode,
          showValidationUrl: data.showValidationUrl,
          showSeal: data.showSeal,
          isActive: data.isActive ?? true,
        },
      })
    : await prisma.certificateTemplate.create({
        data: {
          tenantId: null,
          layout: data.layout,
          backgroundUrl: data.backgroundUrl ?? null,
          logoUrl: data.logoUrl ?? null,
          sealUrl: data.sealUrl ?? null,
          signatureUrl: data.signatureUrl ?? null,
          primaryColor: data.primaryColor ?? null,
          secondaryColor: data.secondaryColor ?? null,
          titleText: data.titleText,
          bodyText: data.bodyText,
          footerText: data.footerText ?? null,
          signerName: data.signerName ?? null,
          signerTitle: data.signerTitle ?? null,
          showQrCode: data.showQrCode,
          showValidationUrl: data.showValidationUrl,
          showSeal: data.showSeal,
          isActive: data.isActive ?? true,
        },
      })

  return NextResponse.json({
    data: {
      id: template.id,
      tenantId: null,
      layout: template.layout,
      backgroundUrl: template.backgroundUrl,
      logoUrl: template.logoUrl,
      sealUrl: template.sealUrl,
      signatureUrl: template.signatureUrl,
      primaryColor: template.primaryColor,
      secondaryColor: template.secondaryColor,
      titleText: template.titleText,
      bodyText: template.bodyText,
      footerText: template.footerText,
      signerName: template.signerName,
      signerTitle: template.signerTitle,
      showQrCode: template.showQrCode,
      showValidationUrl: template.showValidationUrl,
      showSeal: template.showSeal,
      isActive: template.isActive,
    },
  })
  },
)
