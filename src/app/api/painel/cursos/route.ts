import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { displayInterestFreeInstallments } from "@/lib/mercadopago/installments"

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

    // Nº global de parcelas sem juros da unidade — fonte do "Nx sem juros" de
    // pagamento único (espelha a vitrine; ver mapTenantCourseItem).
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { interestFreeInstallments: true },
    })
    const interestFree = tenant?.interestFreeInstallments ?? 1

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
        // ONE_TIME: "Nx sem juros" vem do nº global da unidade (espelha a
        // vitrine). MONTHLY: o número exibido é a quantidade de mensalidades.
        parcelas:
          tc.paymentType === "MONTHLY"
            ? tc.customParcelas ??
              tc.course.parcelasOverride ??
              tc.course.parcelasSugeridas
            : displayInterestFreeInstallments(interestFree),
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
