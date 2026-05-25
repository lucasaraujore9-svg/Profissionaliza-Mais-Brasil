import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.cursos.list", route: "/api/painel/cursos" },
  async () => {
    const ctx = await requireResellerSession()
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Idempotente: garante que o tenant tenha um TenantCourse pra cada
    // curso ATIVO do catálogo global (cria apenas o que falta).
    await ensureTenantCourses(ctx.tenantId)

    const tenantCourses = await prisma.tenantCourse.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ customOrder: "asc" }, { createdAt: "desc" }],
      include: {
        course: {
          select: {
            id: true,
            nome: true,
            descricao: true,
            descricaoOverride: true,
            capaImageUrl: true,
            capaOverride: true,
            qtdAulas: true,
            cargaHoraria: true,
            parcelasSugeridas: true,
            parcelasOverride: true,
          },
        },
        _count: { select: { enrollments: true } },
      },
    })

    return NextResponse.json({
      data: tenantCourses.map((tc) => ({
        id: tc.id,
        courseId: tc.courseId,
        title: tc.course.nome,
        // Hierarquia tenant > admin > plataforma bruto
        description:
          tc.customDescription ??
          tc.course.descricaoOverride ??
          tc.course.descricao,
        capaImageUrl:
          tc.customCapaUrl ?? tc.course.capaOverride ?? tc.course.capaImageUrl,
        qtdAulas: tc.course.qtdAulas,
        cargaHoraria: tc.course.cargaHoraria,
        price: Number(tc.price),
        parcelas:
          tc.customParcelas ??
          tc.course.parcelasOverride ??
          tc.course.parcelasSugeridas,
        paymentType: tc.paymentType,
        isVisible: tc.isVisible,
        isFeatured: tc.isFeatured,
        customOrder: tc.customOrder,
        hasCustomCapa: tc.customCapaUrl != null,
        hasCustomDescription: tc.customDescription != null,
        hasCustomParcelas: tc.customParcelas != null,
        enrollmentsCount: tc._count.enrollments,
      })),
    })
  },
)
