import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { AutomationTemplateKey } from "@prisma/client"
import { DEFAULT_AUTOMATION_TEMPLATES } from "@/lib/automation/default-templates"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  {
    action: "admin.automacao.templates.list",
    route: "/api/admin/automacao/templates",
  },
  async () => {
    const guard = await requireAdmin("automacao.view")
    if (!guard.ok) return guard.response
    let templates = await prisma.automationMessageTemplate.findMany({
      where: { tenantId: null },
      orderBy: { key: "asc" },
    })

    if (templates.length === 0) {
      // Self-heal: cria os defaults para o PMB (tenantId=null)
      for (const t of DEFAULT_AUTOMATION_TEMPLATES) {
        const exists = await prisma.automationMessageTemplate.findFirst({
          where: { tenantId: null, key: t.key },
          select: { id: true },
        })
        if (!exists) {
          await prisma.automationMessageTemplate.create({
            data: {
              tenantId: null,
              key: t.key,
              body: t.body,
              enabled: true,
            },
          })
        }
      }
      templates = await prisma.automationMessageTemplate.findMany({
        where: { tenantId: null },
        orderBy: { key: "asc" },
      })
    }

    return NextResponse.json({
      data: templates.map((t) => ({
        id: t.id,
        key: t.key,
        body: t.body,
        enabled: t.enabled,
      })),
    })
  },
)

const putSchema = z.object({
  templates: z
    .array(
      z.object({
        key: z.nativeEnum(AutomationTemplateKey),
        body: z.string().min(1).max(2000),
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(10),
})

export const PUT = withRequestContext(
  {
    action: "admin.automacao.templates.update",
    route: "/api/admin/automacao/templates",
  },
  async (request: Request) => {
    const guard = await requireAdmin("automacao.manage")
    if (!guard.ok) return guard.response
    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = putSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    // Como (tenantId, key) com NULL nao dedupe no Postgres, usamos
    // findFirst+update/create manual.
    for (const t of parsed.data.templates) {
      const existing = await prisma.automationMessageTemplate.findFirst({
        where: { tenantId: null, key: t.key },
        select: { id: true },
      })
      if (existing) {
        await prisma.automationMessageTemplate.update({
          where: { id: existing.id },
          data: { body: t.body, enabled: t.enabled },
        })
      } else {
        await prisma.automationMessageTemplate.create({
          data: { tenantId: null, key: t.key, body: t.body, enabled: t.enabled },
        })
      }
    }

    return NextResponse.json({ data: { ok: true } })
  },
)
