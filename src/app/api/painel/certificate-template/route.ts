import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { requireResellerOwner } from "@/lib/auth/guards"

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

export async function GET() {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const guard = await requireResellerOwner(ctx.tenantId)
  if (!guard.ok) return guard.response

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
}

export async function PUT(request: Request) {
  const ctx = await requireResellerSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }
  const guard = await requireResellerOwner(ctx.tenantId)
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
}
