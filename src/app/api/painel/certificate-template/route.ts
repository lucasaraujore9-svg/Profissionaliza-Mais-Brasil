import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Unidades (revendedores) NAO editam textos, cores ou uploads do certificado.
 * Apenas escolhem entre 3 layouts pre-prontos. Demais campos sao defaults
 * fixos aplicados em `resolveCertificateTemplate` (UNIT_DEFAULTS).
 * A logo do certificado e puxada automaticamente de `tenant.logoUrl`.
 */
const layoutEnum = z.enum(["CLASSIC", "MODERN", "MINIMAL"])

const upsertSchema = z.object({
  layout: layoutEnum,
})

export const GET = withRequestContext(
  { action: "painel.certificate_template.get", route: "/api/painel/certificate-template" },
  async () => {
    const guard = await requirePainel("certificados.template")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const template = await prisma.certificateTemplate.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { id: true, tenantId: true, layout: true },
    })

    return NextResponse.json({
      data: template
        ? {
            id: template.id,
            tenantId: template.tenantId,
            layout: template.layout,
          }
        : null,
    })
  },
)

export const PUT = withRequestContext(
  { action: "painel.certificate_template.update", route: "/api/painel/certificate-template" },
  async (request: Request) => {
    const guard = await requirePainel("certificados.template")
    if (!guard.ok) return guard.response
    const { ctx } = guard

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

    const { layout } = parsed.data

    const template = await prisma.certificateTemplate.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        layout,
      },
      update: {
        layout,
      },
      select: { id: true, tenantId: true, layout: true },
    })

    return NextResponse.json({
      data: {
        id: template.id,
        tenantId: template.tenantId,
        layout: template.layout,
      },
    })
  },
)
