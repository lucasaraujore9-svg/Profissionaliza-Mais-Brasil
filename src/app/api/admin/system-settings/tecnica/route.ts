import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { validateTecnicaCoursesInput } from "@/lib/catalog/tecnica"
import { requireAdmin } from "@/lib/auth/admin-guard"

const bodySchema = z
  .object({
    enabled: z.boolean(),
    url: z.string().trim().url("URL inválida").max(500).nullable().optional(),
    label: z.string().trim().max(60).nullable().optional(),
    courses: z.unknown().optional(),
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
    const guard = await requireAdmin("vitrine.manage")
    if (!guard.ok) return guard.response

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
        tecnicaCourses: true,
      },
    })

    return NextResponse.json({
      data: {
        tecnicaEnabled: settings?.tecnicaEnabled ?? false,
        tecnicaUrl: settings?.tecnicaUrl ?? null,
        tecnicaLabel: settings?.tecnicaLabel ?? null,
        tecnicaCourses: settings?.tecnicaCourses ?? [],
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
    const guard = await requireAdmin("vitrine.manage")
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

    const coursesResult = validateTecnicaCoursesInput(parsed.data.courses)
    if (!coursesResult.ok) {
      return NextResponse.json({ error: coursesResult.error }, { status: 400 })
    }

    const data = {
      tecnicaEnabled: parsed.data.enabled,
      tecnicaUrl: parsed.data.url ?? null,
      tecnicaLabel: parsed.data.label?.trim() || null,
      tecnicaCourses: coursesResult.courses as unknown as Prisma.InputJsonValue,
    }

    const updated = await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
      select: {
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
        tecnicaCourses: true,
      },
    })

    return NextResponse.json({ data: updated })
  },
)
