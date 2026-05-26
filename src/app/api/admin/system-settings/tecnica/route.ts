import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z
  .object({
    enabled: z.boolean(),
    url: z.string().trim().url("URL inválida").max(500).nullable().optional(),
    label: z.string().trim().max(60).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enabled && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "URL é obrigatória para habilitar Unidade Técnica",
      })
    }
  })

export const GET = withRequestContext(
  {
    action: "admin.system_settings.tecnica.get",
    route: "/api/admin/system-settings/tecnica",
  },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
      },
    })

    return NextResponse.json({
      data: {
        tecnicaEnabled: settings?.tecnicaEnabled ?? false,
        tecnicaUrl: settings?.tecnicaUrl ?? null,
        tecnicaLabel: settings?.tecnicaLabel ?? null,
      },
    })
  },
)

export const PUT = withRequestContext(
  {
    action: "admin.system_settings.tecnica.update",
    route: "/api/admin/system-settings/tecnica",
  },
  async (request: Request) => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const data = {
      tecnicaEnabled: parsed.data.enabled,
      tecnicaUrl: parsed.data.url ?? null,
      tecnicaLabel: parsed.data.label?.trim() || null,
    }

    const updated = await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
      select: {
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
      },
    })

    return NextResponse.json({ data: updated })
  },
)
