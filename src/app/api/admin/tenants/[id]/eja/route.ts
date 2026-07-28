import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { setEjaSectionEnabled } from "@/lib/home/sections"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

// Link da página de EJA de um revendedor. A imagem do banner é padronizada pela
// PMB; aqui a unidade define apenas o link de destino, o rótulo e o flag.
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
        message: "URL é obrigatória para habilitar a seção EJA",
      })
    }
  })

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.eja.update",
    route: "/api/admin/tenants/[id]/eja",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("unidades.manage")
    if (!guard.ok) return guard.response
    const session = guard.ctx
    // Apenas SUPER_ADMIN e PMB_RESELLER_MGR (do tenant) podem alterar.
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
        salesUserId: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Revendedor não encontrado" },
        { status: 404 },
      )
    }

    // PMB_RESELLER_MGR só pode editar tenants sob sua gestão.
    if (!(await session.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data: Prisma.TenantUpdateInput = {
      ejaEnabled: parsed.data.enabled,
      ejaUrl: parsed.data.url ?? null,
      ejaLabel: parsed.data.label?.trim() || null,
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data,
      select: {
        id: true,
        ejaEnabled: true,
        ejaUrl: true,
        ejaLabel: true,
      },
    })

    // Fonte de verdade da renderização é o HomeSection.enabled — não o
    // Tenant.ejaEnabled. Sincroniza para que ligar/desligar aqui surta efeito
    // na vitrine da unidade (ver setEjaSectionEnabled).
    await setEjaSectionEnabled(updated.id, updated.ejaEnabled)

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    return NextResponse.json({
      data: {
        id: updated.id,
        ejaEnabled: updated.ejaEnabled,
        ejaUrl: updated.ejaUrl,
        ejaLabel: updated.ejaLabel,
      },
    })
  },
)
