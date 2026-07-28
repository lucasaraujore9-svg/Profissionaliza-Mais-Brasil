import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { syncTenantBrandingToLms } from "@/lib/lms"

interface VitrineDto {
  name: string
  tagline: string | null
  description: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryColor: string
  secondaryColor: string
  whatsapp: string | null
  whatsappFloatEnabled: boolean
  whatsappFloatSide: string
  whatsappFloatMessage: string | null
  instagram: string | null
  facebook: string | null
  youtube: string | null
  tiktok: string | null
  supportEmail: string | null
  supportHours: string | null
}

async function readTenant(tenantId: string): Promise<VitrineDto | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      tagline: true,
      description: true,
      logoUrl: true,
      bannerUrl: true,
      primaryColor: true,
      secondaryColor: true,
      whatsapp: true,
      whatsappFloatEnabled: true,
      whatsappFloatSide: true,
      whatsappFloatMessage: true,
      instagram: true,
      facebook: true,
      youtube: true,
      tiktok: true,
      supportEmail: true,
      supportHours: true,
    },
  })
  if (!tenant) return null
  return tenant
}

export const GET = withRequestContext(
  { action: "painel.vitrine.get", route: "/api/painel/vitrine" },
  async () => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const data = await readTenant(ctx.tenantId)
    if (!data) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }
    return NextResponse.json({ data })
  },
)

const hexColor = z
  .string()
  .trim()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Cor inválida (use formato hex)")

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  tagline: z.string().trim().max(160).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  whatsappFloatEnabled: z.boolean().optional(),
  whatsappFloatSide: z.enum(["right", "left"]).optional(),
  whatsappFloatMessage: z.string().trim().max(300).nullable().optional(),
  instagram: z.string().trim().max(120).nullable().optional(),
  facebook: z.string().trim().max(120).nullable().optional(),
  youtube: z.string().trim().max(120).nullable().optional(),
  tiktok: z.string().trim().max(120).nullable().optional(),
  supportEmail: z.string().trim().email("E-mail inválido").max(160).nullable().optional(),
  supportHours: z.string().trim().max(120).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
})

export const PUT = withRequestContext(
  { action: "painel.vitrine.update", route: "/api/painel/vitrine" },
  async (request: Request) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = updateSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: parsed.data,
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    const data = await readTenant(tenant.id)

    // Re-sincroniza o branding (nome/logo) com o LMS. Best-effort, no-op sem LMS.
    if (data) {
      await syncTenantBrandingToLms({
        id: tenant.id,
        slug: tenant.slug,
        name: data.name,
        logoUrl: data.logoUrl,
      })
    }

    return NextResponse.json({ data })
  },
)
