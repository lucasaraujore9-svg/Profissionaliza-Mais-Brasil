import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  validateSlugFormat,
  isSlugAvailable,
  SLUG_REDIRECT_DAYS,
} from "@/lib/tenant/slug"
import {
  invalidateTenant,
  setSlugRedirect,
  invalidateSlugRedirect,
} from "@/lib/redis/tenant-cache"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const schema = z.object({
  slug: z.string().trim().toLowerCase().min(3).max(32),
})

// PATCH /api/admin/revendedores/[id]/slug — renomeia o subdominio de uma revenda.
//
// Permissao (so equipe PMB; NUNCA a propria revenda/consultor):
//   - SUPER_ADMIN      -> qualquer revenda
//   - PMB_RESELLER_MGR -> apenas revendas atribuidas a ele (accountManagerId)
//   - PMB_SALES        -> negado
//
// Efeitos: o subdominio ANTIGO redireciona (308) para o novo por 15 dias e fica
// reservado (indisponivel a outras revendas) na mesma janela. O polo na
// plataforma parceira (poloName) fica fixo para nao orfanar alunos ja matriculados.
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.slug.update", route: "/api/admin/revendedores/[id]/slug" },
  async (req: Request, ctx) => {
    const guard = await requireAdmin("unidades.manage")
    if (!guard.ok) return guard.response
    const session = guard.ctx

    const { id } = await ctx.params

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        poloName: true,
        customDomain: true,
        accountManagerId: true,
        salesUserId: true,
      },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }

    // `unidades.manage` ja excluiu quem nao administra unidade (comercial de
    // revenda, financeiro, designer). Aqui fica so o recorte da carteira: quem
    // nao enxerga a rede inteira edita apenas as unidades atribuidas a ele.
    if (!(await session.canAccessTenant(tenant))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
    }
    const newSlug = parsed.data.slug
    const oldSlug = tenant.slug

    if (newSlug === oldSlug) {
      return NextResponse.json({ data: { id: tenant.id, slug: oldSlug } })
    }

    const formatError = validateSlugFormat(newSlug)
    if (formatError) {
      return NextResponse.json({ error: formatError }, { status: 400 })
    }

    const availability = await isSlugAvailable(newSlug, tenant.id)
    if (!availability.available) {
      return NextResponse.json({ error: availability.reason }, { status: 409 })
    }

    const expiresAt = new Date(Date.now() + SLUG_REDIRECT_DAYS * 24 * 60 * 60 * 1000)

    await prisma.$transaction(async (tx) => {
      // Mantem o polo da plataforma estavel: se ainda nao tem poloName fixo,
      // congela no slug antigo antes de renomear (alunos ja matriculados seguem
      // no mesmo polo da plataforma parceira).
      if (tenant.poloName == null) {
        await tx.tenant.update({
          where: { id: tenant.id },
          data: { poloName: oldSlug },
        })
      }

      // Reserva/redirect do subdominio antigo por 15 dias.
      await tx.tenantSlugRedirect.upsert({
        where: { oldSlug },
        create: { oldSlug, tenantId: tenant.id, expiresAt },
        update: { tenantId: tenant.id, expiresAt },
      })

      // Se o novo slug era um subdominio antigo reservado (desta mesma unidade),
      // libera a reserva — estamos reivindicando-o de volta.
      await tx.tenantSlugRedirect.deleteMany({ where: { oldSlug: newSlug } })

      await tx.tenant.update({
        where: { id: tenant.id },
        data: { slug: newSlug },
      })
    })

    // Cache: invalida o tenant nos dois slugs + grava o redirect e remove
    // qualquer redirect remanescente apontando para o novo slug.
    await Promise.all([
      invalidateTenant({ id: tenant.id, slug: oldSlug, customDomain: tenant.customDomain }),
      invalidateTenant({ id: tenant.id, slug: newSlug, customDomain: tenant.customDomain }),
      setSlugRedirect(oldSlug, newSlug),
      invalidateSlugRedirect(newSlug),
    ]).catch(swallow("admin.revendedores.slug"))

    contextLogger().info(
      {
        event: "admin.reseller.slug_renamed",
        tenantId: tenant.id,
        oldSlug,
        newSlug,
        actorId: session.userId,
        actorRole: session.role,
      },
      "Subdomínio da revenda renomeado",
    )

    return NextResponse.json({ data: { id: tenant.id, slug: newSlug } })
  },
)
