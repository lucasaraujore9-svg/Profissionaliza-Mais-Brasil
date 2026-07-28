import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { deleteVitrineAsset, extractAssetPath } from "@/lib/supabase/storage"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const patchSchema = z.object({
  order: z.number().int().min(0).max(99).optional(),
  active: z.boolean().optional(),
  linkUrl: z.string().url().nullable().optional(),
})

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "painel.banner.update", route: "/api/painel/banner/[id]" },
  async (
    request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params
    const slide = await prisma.bannerSlide.findFirst({
      where: { id, tenantId: ctx.tenantId },
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

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (tenant) await invalidateTenant(tenant)

    return NextResponse.json({ data: updated })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.banner.delete", route: "/api/painel/banner/[id]" },
  async (
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const guard = await requirePainel("vitrine.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { id } = await params
    const slide = await prisma.bannerSlide.findFirst({
      where: { id, tenantId: ctx.tenantId },
    })
    if (!slide) {
      return NextResponse.json({ error: "Slide não encontrado" }, { status: 404 })
    }

    await prisma.bannerSlide.delete({ where: { id } })

    // Limpa os assets do Storage (best-effort)
    for (const url of [slide.desktopUrl, slide.mobileUrl]) {
      const path = extractAssetPath(url)
      if (path) {
        try {
          await deleteVitrineAsset(path)
        } catch {
          // Falha silenciosa: orfao no Storage nao quebra o fluxo.
        }
      }
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, slug: true, customDomain: true },
    })
    if (tenant) await invalidateTenant(tenant)

    return NextResponse.json({ data: { ok: true } })
  },
)
