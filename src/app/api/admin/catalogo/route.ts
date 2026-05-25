import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { getLastSuccessfulSync } from "@/lib/catalog/sync-log"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "admin.catalogo.list", route: "/api/admin/catalogo" },
  async () => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const [courses, lastSync] = await Promise.all([
    prisma.course.findMany({
      select: {
        id: true,
        nome: true,
        slug: true,
        qtdAulas: true,
        cargaHoraria: true,
        precoOriginal: true,
        precoPromocional: true,
        categoriaLoja: true,
        destaque: true,
        status: true,
        capaImageUrl: true,
        syncedAt: true,
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
        qtdAulas: c.qtdAulas,
        cargaHoraria: c.cargaHoraria,
        precoOriginal: c.precoOriginal ? Number(c.precoOriginal) : null,
        precoPromocional: c.precoPromocional ? Number(c.precoPromocional) : null,
        categoriaLoja: c.categoriaLoja,
        destaque: c.destaque,
        status: c.status,
        capaImageUrl: c.capaImageUrl,
        syncedAt: c.syncedAt.toISOString(),
        resellers: c._count.tenantCourses,
        students: c._count.enrollments,
        precoVitrineMain: c.precoVitrineMain ? Number(c.precoVitrineMain) : null,
        destaqueHome: c.destaqueHome,
        paymentTypeMain: c.paymentTypeMain,
        monthlyMonthsMain: c.monthlyMonthsMain,
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
