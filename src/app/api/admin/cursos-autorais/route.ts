import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

/**
 * Cursos produzidos pelas UNIDADES, na visão da PMB.
 *
 * Não há aprovação prévia (decisão do dono): a unidade publica direto. Esta
 * listagem é a contrapartida — a intervenção REATIVA. Sem ela, a PMB não tem
 * como nem saber o que está sendo vendido com a marca dela na vitrine
 * principal.
 */
export const GET = withRequestContext(
  { action: "admin.cursos_autorais.list", route: "/api/admin/cursos-autorais" },
  async () => {
    const guard = await requireAdmin("cursosAutorais.view")
    if (!guard.ok) return guard.response

    const rows = await prisma.course.findMany({
      where: { authorTenantId: { not: null } },
      orderBy: [{ authoredStatus: "asc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        nome: true,
        slug: true,
        authoredStatus: true,
        distribution: true,
        pricingMode: true,
        authorAmount: true,
        sellerCommissionPercent: true,
        platformFeePercent: true,
        lmsCourseId: true,
        updatedAt: true,
        authorTenant: { select: { id: true, name: true, slug: true } },
        _count: { select: { enrollments: true } },
      },
    })

    return NextResponse.json({
      data: rows.map((c) => ({
        id: c.id,
        nome: c.nome,
        slug: c.slug,
        authoredStatus: c.authoredStatus,
        distribution: c.distribution,
        pricingMode: c.pricingMode,
        authorAmount: c.authorAmount === null ? null : Number(c.authorAmount),
        sellerCommissionPercent:
          c.sellerCommissionPercent === null ? null : Number(c.sellerCommissionPercent),
        platformFeePercent:
          c.platformFeePercent === null ? null : Number(c.platformFeePercent),
        hasContent: c.lmsCourseId !== null,
        enrollments: c._count.enrollments,
        updatedAt: c.updatedAt,
        unidade: c.authorTenant
          ? { id: c.authorTenant.id, name: c.authorTenant.name, slug: c.authorTenant.slug }
          : null,
      })),
    })
  },
)
