import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { courseCuratedForTenant } from "@/lib/catalog/visibility"
import { requirePainel } from "@/lib/auth/painel-guard"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  ADVERTISED_INSTALLMENTS_SELECT,
  tenantAdvertisedInterestFree,
} from "@/lib/tenant/checkout-mode"

export const GET = withRequestContext(
  { action: "painel.cursos.list", route: "/api/painel/cursos" },
  async () => {
    const guard = await requirePainel("catalogo.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    // Idempotente: garante que o tenant tenha um TenantCourse pra cada
    // curso ATIVO do catálogo global (cria apenas o que falta).
    await ensureTenantCourses(ctx.tenantId)

    // Parcelas sem juros que a vitrine desta unidade anuncia no pagamento único
    // (espelha a vitrine; ver mapTenantCourseItem). null quando o checkout dela
    // não parcela o cartão.
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: ADVERTISED_INSTALLMENTS_SELECT,
    })
    const interestFree = tenant ? tenantAdvertisedInterestFree(tenant) : null

    const tenantCourses = await prisma.tenantCourse.findMany({
      // Curso que a PMB restringiu a outras unidades ("ocultar para todas
      // EXCETO") some do painel desta: aparecia como "visível" e a loja dela
      // respondia "curso não encontrado". O TenantCourse fica guardado (preço e
      // capa voltam a valer se a PMB liberar o curso para ela).
      where: { tenantId: ctx.tenantId, course: { AND: [courseCuratedForTenant(ctx.tenantId)] } },
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
        // ONE_TIME: "Nx sem juros" vem do nº global da unidade (espelha a
        // vitrine). MONTHLY: o número exibido é a quantidade de mensalidades.
        parcelas:
          tc.paymentType === "MONTHLY"
            ? tc.customParcelas ??
              tc.course.parcelasOverride ??
              tc.course.parcelasSugeridas
            : interestFree,
        paymentType: tc.paymentType,
        isVisible: tc.isVisible,
        isFeatured: tc.isFeatured,
        customOrder: tc.customOrder,
        hasCustomCapa: tc.customCapaUrl != null,
        hasCustomDescription: tc.customDescription != null,
        hasCustomParcelas: tc.customParcelas != null,
        enrollmentsCount: tc._count.enrollments,
        createdAt: tc.createdAt.toISOString(),
        updatedAt: tc.updatedAt.toISOString(),
      })),
    })
  },
)
