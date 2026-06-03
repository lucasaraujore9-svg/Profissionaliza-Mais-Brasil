import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { validateTecnicaCoursesInput } from "@/lib/catalog/tecnica"

const bodySchema = z
  .object({
    enabled: z.boolean(),
    url: z
      .string()
      .trim()
      .url("URL inválida")
      .max(500)
      .nullable()
      .optional(),
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

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.tecnica.update",
    route: "/api/admin/tenants/[id]/tecnica",
  },
  async (request: Request, context) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    // Apenas SUPER_ADMIN e PMB_RESELLER_MGR (do tenant) podem alterar.
    if (
      session.role !== "SUPER_ADMIN" &&
      session.role !== "PMB_RESELLER_MGR"
    ) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

    const { id } = await context.params

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

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        customDomain: true,
        accountManagerId: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Revendedor não encontrado" },
        { status: 404 },
      )
    }

    // PMB_RESELLER_MGR só pode editar tenants sob sua gestão.
    if (
      session.role === "PMB_RESELLER_MGR" &&
      tenant.accountManagerId !== session.userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // So toca em `tecnicaCourses` quando `courses` foi explicitamente enviado.
    // Sem isto, salvar apenas enabled/url/label (ex.: alternar o toggle)
    // zerava a lista de cursos — `validateTecnicaCoursesInput(undefined)`
    // retorna `{ courses: [] }` — destruindo o fallback usado pela vitrine.
    const data: Prisma.TenantUpdateInput = {
      tecnicaEnabled: parsed.data.enabled,
      tecnicaUrl: parsed.data.url ?? null,
      tecnicaLabel: parsed.data.label?.trim() || null,
    }
    if (parsed.data.courses !== undefined) {
      const coursesResult = validateTecnicaCoursesInput(parsed.data.courses)
      if (!coursesResult.ok) {
        return NextResponse.json({ error: coursesResult.error }, { status: 400 })
      }
      data.tecnicaCourses = coursesResult.courses as unknown as Prisma.InputJsonValue
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data,
      select: {
        id: true,
        tecnicaEnabled: true,
        tecnicaUrl: true,
        tecnicaLabel: true,
        tecnicaCourses: true,
      },
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        tecnicaEnabled: updated.tecnicaEnabled,
        tecnicaUrl: updated.tecnicaUrl,
        tecnicaLabel: updated.tecnicaLabel,
        tecnicaCourses: updated.tecnicaCourses,
      },
    })
  },
)
