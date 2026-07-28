import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { AutomationTemplateKey } from "@prisma/client"
import { DEFAULT_AUTOMATION_TEMPLATES } from "@/lib/automation/default-templates"
import { isTenantAutomationEnabled } from "@/lib/automation/context"

export const GET = withRequestContext(
  {
    action: "painel.automacao.templates.list",
    route: "/api/painel/automacao/templates",
  },
  async () => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    let templates = await prisma.automationMessageTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { key: "asc" },
    })

    // Self-heal: se nao existem (admin nao criou), cria os defaults agora.
    if (templates.length === 0) {
      await prisma.automationMessageTemplate.createMany({
        data: DEFAULT_AUTOMATION_TEMPLATES.map((t) => ({
          tenantId: ctx.tenantId,
          key: t.key,
          body: t.body,
          enabled: true,
        })),
      })
      templates = await prisma.automationMessageTemplate.findMany({
        where: { tenantId: ctx.tenantId },
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
    action: "painel.automacao.templates.update",
    route: "/api/painel/automacao/templates",
  },
  async (request: Request) => {
    const guard = await requirePainel("automacao.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    // SAAS-003: gate de entitlement no servidor (não confiar só na UI).
    if (!(await isTenantAutomationEnabled(ctx.tenantId))) {
      return NextResponse.json(
        {
          error: "Recurso disponível apenas no plano com Automação",
          code: "AUTOMATION_DISABLED",
        },
        { status: 403 },
      )
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
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    await prisma.$transaction(
      parsed.data.templates.map((t) =>
        prisma.automationMessageTemplate.upsert({
          where: {
            tenantId_key: { tenantId: ctx.tenantId, key: t.key },
          },
          update: { body: t.body, enabled: t.enabled },
          create: {
            tenantId: ctx.tenantId,
            key: t.key,
            body: t.body,
            enabled: t.enabled,
          },
        }),
      ),
    )

    return NextResponse.json({ data: { ok: true } })
  },
)
