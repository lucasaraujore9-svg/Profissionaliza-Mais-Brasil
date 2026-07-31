import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContext } from "@/lib/observability/with-request-context"

const createSchema = z.object({
  desktopUrl: z.string().url(),
  mobileUrl: z.string().url(),
  linkUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
})

export const GET = withRequestContext(
  { action: "painel.banner.list", route: "/api/painel/banner" },
  async () => {
    const guard = await requirePainel("vitrine.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const slides = await prisma.bannerSlide.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({ data: slides })
  },
)

export const POST = withRequestContext(
  { action: "painel.banner.create", route: "/api/painel/banner" },
  async (request: Request) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const body = await request.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const count = await prisma.bannerSlide.count({
      where: { tenantId: ctx.tenantId },
    })
    if (count >= 10) {
      return NextResponse.json(
        { error: "Limite de 10 slides por banner atingido" },
        { status: 400 },
      )
    }

    const created = await prisma.bannerSlide.create({
      data: {
        tenantId: ctx.tenantId,
        order: count,
        desktopUrl: parsed.data.desktopUrl,
        mobileUrl: parsed.data.mobileUrl,
        linkUrl: parsed.data.linkUrl ?? null,
        active: parsed.data.active ?? true,
      },
    })

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (tenant) {
      await invalidateTenant(tenant)
    }

    return NextResponse.json({ data: created }, { status: 201 })
  },
)
