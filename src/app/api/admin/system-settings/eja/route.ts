import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

// Conteúdo da seção "EJA" do site PMB + banner padronizado para a rede.
// Diferente da Técnica, não há lista de cursos — só banner + link + rótulo.
const bodySchema = z
  .object({
    enabled: z.boolean(),
    url: z.string().trim().url("URL inválida").max(500).nullable().optional(),
    label: z.string().trim().max(60).nullable().optional(),
    // Aceita URL absoluta (https://…supabase.co/…) ou caminho público (/...).
    bannerImageUrl: z
      .string()
      .trim()
      .max(500)
      .regex(/^(https?:\/\/|\/)/i, "Imagem inválida (use https://… ou /caminho)")
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.enabled && !data.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "URL é obrigatória para habilitar a seção EJA",
      })
    }
  })

export const GET = withRequestContext(
  {
    action: "admin.system_settings.eja.get",
    route: "/api/admin/system-settings/eja",
  },
  async () => {
    const guard = await requireSuperAdmin()
    if (!guard.ok) return guard.response

    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: {
        ejaEnabled: true,
        ejaUrl: true,
        ejaLabel: true,
        ejaBannerImageUrl: true,
      },
    })

    return NextResponse.json({
      data: {
        ejaEnabled: settings?.ejaEnabled ?? false,
        ejaUrl: settings?.ejaUrl ?? null,
        ejaLabel: settings?.ejaLabel ?? null,
        ejaBannerImageUrl: settings?.ejaBannerImageUrl ?? null,
      },
    })
  },
)

export const PUT = withRequestContext(
  {
    action: "admin.system_settings.eja.update",
    route: "/api/admin/system-settings/eja",
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
      ejaEnabled: parsed.data.enabled,
      ejaUrl: parsed.data.url ?? null,
      ejaLabel: parsed.data.label?.trim() || null,
      ejaBannerImageUrl: parsed.data.bannerImageUrl ?? null,
    }

    const updated = await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: data,
      create: { id: "default", ...data },
      select: {
        ejaEnabled: true,
        ejaUrl: true,
        ejaLabel: true,
        ejaBannerImageUrl: true,
      },
    })

    return NextResponse.json({ data: updated })
  },
)
