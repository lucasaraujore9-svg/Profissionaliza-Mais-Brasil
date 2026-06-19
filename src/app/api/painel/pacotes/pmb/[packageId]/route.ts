import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

const patchSchema = z.object({
  price: z.number().positive("Preço deve ser maior que zero").nullable().optional(),
  isVisible: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  customCoverUrl: z.string().url().nullable().optional(),
})

// Override da revenda para um pacote da PMB (preço próprio, ocultar/exibir,
// destaque). Nunca altera os cursos do pacote PMB — só a configuração local.
export const PATCH = withRequestContextParams<{ packageId: string }>(
  { action: "painel.pacotes.pmb.override", route: "/api/painel/pacotes/pmb/[packageId]" },
  async (request: Request, { params }: { params: Promise<{ packageId: string }> }) => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const { packageId } = await params

    // Garante que o alvo é mesmo um pacote da PMB (tenantId null).
    const pmbPkg = await prisma.coursePackage.findFirst({
      where: { id: packageId, tenantId: null },
      select: { id: true },
    })
    if (!pmbPkg) {
      return NextResponse.json(
        { error: "Pacote da PMB não encontrado", code: "NOT_PMB_PACKAGE" },
        { status: 404 },
      )
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    const updateData = {
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.isVisible !== undefined ? { isVisible: data.isVisible } : {}),
      ...(data.isFeatured !== undefined ? { isFeatured: data.isFeatured } : {}),
      ...(data.customCoverUrl !== undefined ? { customCoverUrl: data.customCoverUrl } : {}),
    }

    const saved = await prisma.tenantPackage.upsert({
      where: { tenantId_packageId: { tenantId: ctx.tenantId, packageId } },
      create: {
        tenantId: ctx.tenantId,
        packageId,
        price: data.price ?? null,
        isVisible: data.isVisible ?? true,
        isFeatured: data.isFeatured ?? false,
        customCoverUrl: data.customCoverUrl ?? null,
      },
      update: updateData,
    })

    return NextResponse.json({
      data: {
        packageId,
        price: saved.price != null ? Number(saved.price) : null,
        isVisible: saved.isVisible,
        isFeatured: saved.isFeatured,
        customCoverUrl: saved.customCoverUrl,
      },
    })
  },
)
