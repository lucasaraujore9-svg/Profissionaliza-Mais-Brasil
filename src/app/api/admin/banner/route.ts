import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

const createSchema = z.object({
  desktopUrl: z.string().url(),
  mobileUrl: z.string().url(),
  linkUrl: z.string().url().nullable().optional(),
  active: z.boolean().optional(),
})

export const GET = withRequestContext(
  { action: "admin.banner.list", route: "/api/admin/banner" },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const slides = await prisma.bannerSlide.findMany({
      where: { tenantId: null },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    })

    return NextResponse.json({ data: slides })
  },
)

export const POST = withRequestContext(
  { action: "admin.banner.create", route: "/api/admin/banner" },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const body = await request.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const count = await prisma.bannerSlide.count({ where: { tenantId: null } })
    if (count >= 10) {
      return NextResponse.json(
        { error: "Limite de 10 slides por banner atingido" },
        { status: 400 },
      )
    }

    const created = await prisma.bannerSlide.create({
      data: {
        tenantId: null,
        order: count,
        desktopUrl: parsed.data.desktopUrl,
        mobileUrl: parsed.data.mobileUrl,
        linkUrl: parsed.data.linkUrl ?? null,
        active: parsed.data.active ?? true,
      },
    })

    return NextResponse.json({ data: created }, { status: 201 })
  },
)
