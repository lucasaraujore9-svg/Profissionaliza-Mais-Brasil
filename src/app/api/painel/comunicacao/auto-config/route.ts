import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.comunicacao.auto_config.list", route: "/api/painel/comunicacao/auto-config" },
  async () => {
    const guard = await requirePainel("comunicacao.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const [configs, overrides] = await Promise.all([
      prisma.notificationCategoryConfig.findMany({
        where: { target: "STUDENT" },
        orderBy: { category: "asc" },
      }),
      prisma.tenantNotificationOverride.findMany({
        where: { tenantId: ctx.tenantId },
      }),
    ])

    const overrideMap = new Map(overrides.map((o) => [o.category, o.enabled]))

    return NextResponse.json({
      data: {
        items: configs.map((r) => {
          const overrideEnabled = overrideMap.get(r.category)
          const overridden = overrideEnabled !== undefined
          // Efetivo: global=false bloqueia · global=true + override=false bloqueia · resto envia
          const effectiveEnabled = r.enabled && (!overridden || overrideEnabled === true)
          return {
            target: r.target,
            category: r.category,
            label: r.label,
            description: r.description,
            enabled: effectiveEnabled,
            defaultLevel: r.defaultLevel,
            globalEnabled: r.enabled,
            overridden,
            // Quando o admin master desligou globalmente, o revendedor nao
            // consegue ativar — fica trancado em OFF.
            locked: !r.enabled,
          }
        }),
      },
    })
  },
)

const patchSchema = z.object({
  category: z.string().min(1).max(64),
  enabled: z.boolean(),
})

export const PATCH = withRequestContext(
  { action: "painel.comunicacao.auto_config.update", route: "/api/painel/comunicacao/auto-config" },
  async (request: Request) => {
    const guard = await requirePainel("comunicacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      )
    }
    const { category, enabled } = parsed.data

    const config = await prisma.notificationCategoryConfig.findUnique({
      where: { target_category: { target: "STUDENT", category } },
      select: { enabled: true },
    })
    if (!config) {
      return NextResponse.json(
        { error: "Categoria não disponível para alunos" },
        { status: 404 },
      )
    }
    if (!config.enabled && enabled) {
      return NextResponse.json(
        { error: "Esta categoria foi desligada globalmente pelo Admin Master" },
        { status: 409 },
      )
    }

    if (enabled) {
      // Voltar ao padrao = apagar o override
      await prisma.tenantNotificationOverride.deleteMany({
        where: { tenantId: ctx.tenantId, category },
      })
    } else {
      await prisma.tenantNotificationOverride.upsert({
        where: { tenantId_category: { tenantId: ctx.tenantId, category } },
        update: { enabled: false },
        create: { tenantId: ctx.tenantId, category, enabled: false },
      })
    }

    return NextResponse.json({ data: { category, enabled } })
  },
)
