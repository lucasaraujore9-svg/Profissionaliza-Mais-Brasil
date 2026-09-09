import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getLastSuccessfulSync } from "@/lib/catalog/sync-log"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.catalogo.list", route: "/api/admin/catalogo" },
  async () => {
  const guard = await requireAdmin("catalogo.view")
  if (!guard.ok) return guard.response

  const [courses, lastSync] = await Promise.all([
    prisma.course.findMany({
      select: {
        id: true,
        nome: true,
        slug: true,
        provider: true,
        contentType: true,
        ebookPages: true,
        qtdAulas: true,
        cargaHoraria: true,
        precoOriginal: true,
        precoPromocional: true,
        categoriaLoja: true,
        destaque: true,
        status: true,
        hiddenMain: true,
        capaImageUrl: true,
        syncedAt: true,
        updatedAt: true,
        precoVitrineMain: true,
        destaqueHome: true,
        paymentTypeMain: true,
        monthlyMonthsMain: true,
        _count: {
          select: {
            tenantCourses: true,
            enrollments: true,
          },
        },
      },
      orderBy: { nome: "asc" },
    }),
    getLastSuccessfulSync(),
  ])

  return NextResponse.json({
    data: {
      courses: courses.map((c) => ({
        id: c.id,
        nome: c.nome,
        slug: c.slug,
        provider: c.provider,
        contentType: c.contentType,
        ebookPages: c.ebookPages,
        qtdAulas: c.qtdAulas,
        cargaHoraria: c.cargaHoraria,
        precoOriginal: c.precoOriginal ? Number(c.precoOriginal) : null,
        precoPromocional: c.precoPromocional ? Number(c.precoPromocional) : null,
        categoriaLoja: c.categoriaLoja,
        destaque: c.destaque,
        status: c.status,
        hiddenMain: c.hiddenMain,
        capaImageUrl: c.capaImageUrl,
        syncedAt: c.syncedAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        resellers: c._count.tenantCourses,
        students: c._count.enrollments,
        precoVitrineMain: c.precoVitrineMain ? Number(c.precoVitrineMain) : null,
        destaqueHome: c.destaqueHome,
        paymentTypeMain: c.paymentTypeMain,
        monthlyMonthsMain: c.monthlyMonthsMain,
        hasOverride: c.precoVitrineMain != null,
      })),
      lastSync: lastSync
        ? {
            at: lastSync.at,
            totalInEa: lastSync.totalInEa,
            added: lastSync.added,
            updated: lastSync.updated,
          }
        : null,
      total: courses.length,
    },
  })
  },
)
