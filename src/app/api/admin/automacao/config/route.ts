import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.automacao.config.get", route: "/api/admin/automacao/config" },
  async () => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (ctx.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
      select: {
        pmbAutomationEnabled: true,
        pmbAbandonedAfterHours: true,
        pmbWaStatus: true,
        pmbWaConnectedPhone: true,
      },
    })

    return NextResponse.json({ data: settings })
  },
)

const putSchema = z
  .object({
    pmbAutomationEnabled: z.boolean().optional(),
    pmbAbandonedAfterHours: z.number().int().min(1).max(168).optional(),
  })
  .refine(
    (d) => d.pmbAutomationEnabled !== undefined || d.pmbAbandonedAfterHours !== undefined,
    "Informe ao menos um campo para atualizar",
  )

export const PUT = withRequestContext(
  {
    action: "admin.automacao.config.update",
    route: "/api/admin/automacao/config",
  },
  async (request: Request) => {
    const ctx = await requireAdminSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (ctx.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = putSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updated = await prisma.systemSettings.update({
      where: { id: "default" },
      data: {
        ...(parsed.data.pmbAutomationEnabled !== undefined
          ? { pmbAutomationEnabled: parsed.data.pmbAutomationEnabled }
          : {}),
        ...(parsed.data.pmbAbandonedAfterHours !== undefined
          ? { pmbAbandonedAfterHours: parsed.data.pmbAbandonedAfterHours }
          : {}),
      },
      select: {
        pmbAutomationEnabled: true,
        pmbAbandonedAfterHours: true,
      },
    })

    return NextResponse.json({ data: updated })
  },
)
