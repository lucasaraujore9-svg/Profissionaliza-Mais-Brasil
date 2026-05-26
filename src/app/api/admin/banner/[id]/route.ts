import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { deleteVitrineAsset, extractAssetPath } from "@/lib/supabase/storage"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const patchSchema = z.object({
  order: z.number().int().min(0).max(99).optional(),
  active: z.boolean().optional(),
  linkUrl: z.string().url().nullable().optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.banner.update", route: "/api/admin/banner/[id]" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const { id } = await params
    const slide = await prisma.bannerSlide.findFirst({
      where: { id, tenantId: null },
    })
    if (!slide) {
      return NextResponse.json({ error: "Slide não encontrado" }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const updated = await prisma.bannerSlide.update({
      where: { id },
      data: {
        ...(parsed.data.order !== undefined && { order: parsed.data.order }),
        ...(parsed.data.active !== undefined && { active: parsed.data.active }),
        ...(parsed.data.linkUrl !== undefined && { linkUrl: parsed.data.linkUrl }),
      },
    })

    return NextResponse.json({ data: updated })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "admin.banner.delete", route: "/api/admin/banner/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const { id } = await params
    const slide = await prisma.bannerSlide.findFirst({
      where: { id, tenantId: null },
    })
    if (!slide) {
      return NextResponse.json({ error: "Slide não encontrado" }, { status: 404 })
    }

    await prisma.bannerSlide.delete({ where: { id } })

    for (const url of [slide.desktopUrl, slide.mobileUrl]) {
      const path = extractAssetPath(url)
      if (path) {
        try {
          await deleteVitrineAsset(path)
        } catch {
          // best-effort
        }
      }
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
