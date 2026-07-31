import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import type { NotificationLevel } from "@prisma/client"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const VALID_TARGETS = ["TENANT", "STUDENT", "ADMIN"] as const
type ConfigTarget = (typeof VALID_TARGETS)[number]

const NOTIFICATION_LEVELS: NotificationLevel[] = [
  "INFO",
  "SUCCESS",
  "WARNING",
  "ERROR",
]

export const GET = withRequestContext(
  { action: "admin.notifications.auto_config.list", route: "/api/admin/notifications/auto-config" },
  async (request: Request) => {
  const auth = await requireAdmin("configuracoes.view")
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const targetRaw = searchParams.get("target")
  const where = targetRaw && VALID_TARGETS.includes(targetRaw as ConfigTarget)
    ? { target: targetRaw }
    : {}

  const rows = await prisma.notificationCategoryConfig.findMany({
    where,
    orderBy: [{ target: "asc" }, { category: "asc" }],
  })

  return NextResponse.json({
    data: {
      items: rows.map((r) => ({
        target: r.target,
        category: r.category,
        label: r.label,
        description: r.description,
        enabled: r.enabled,
        defaultLevel: r.defaultLevel,
        updatedAt: r.updatedAt.toISOString(),
      })),
    },
  })
  },
)

const patchSchema = z.object({
  target: z.enum(VALID_TARGETS),
  category: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  defaultLevel: z.enum(NOTIFICATION_LEVELS as [NotificationLevel, ...NotificationLevel[]]).optional(),
})

export const PATCH = withRequestContext(
  { action: "admin.notifications.auto_config.update", route: "/api/admin/notifications/auto-config" },
  async (request: Request) => {
  const auth = await requireAdmin("configuracoes.manage")
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
      { status: 400 },
    )
  }

  const { target, category, enabled, defaultLevel } = parsed.data

  if (enabled === undefined && defaultLevel === undefined) {
    return NextResponse.json(
      { error: "Informe enabled ou defaultLevel" },
      { status: 400 },
    )
  }

  const existing = await prisma.notificationCategoryConfig.findUnique({
    where: { target_category: { target, category } },
  })
  if (!existing) {
    return NextResponse.json(
      { error: "Categoria não encontrada para esse target" },
      { status: 404 },
    )
  }

  const updated = await prisma.notificationCategoryConfig.update({
    where: { target_category: { target, category } },
    data: {
      ...(enabled !== undefined ? { enabled } : {}),
      ...(defaultLevel !== undefined ? { defaultLevel } : {}),
    },
  })

  return NextResponse.json({
    data: {
      target: updated.target,
      category: updated.category,
      enabled: updated.enabled,
      defaultLevel: updated.defaultLevel,
    },
  })
  },
)
