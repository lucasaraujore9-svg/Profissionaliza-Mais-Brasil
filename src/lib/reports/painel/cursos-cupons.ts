import { prisma } from "@/lib/prisma"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type PainelBiContext, type PainelBiModule } from "./context"

export const cursosCuponsModule: PainelBiModule = {
  async run(ctx: PainelBiContext) {
    const { period, tenantId } = ctx
    const range = { gte: period.start, lt: period.end }

    const [byCourse, activeCoupons, couponUses, discountAgg, coupons] = await Promise.all([
      prisma.enrollment.groupBy({
        by: ["courseId"],
        where: { tenantId, createdAt: range, status: { in: ["ACTIVE", "COMPLETED"] } },
        _count: { _all: true },
        _sum: { finalAmount: true },
        orderBy: { _count: { courseId: "desc" } },
        take: 50,
      }),
      prisma.coupon.count({ where: { tenantId, isActive: true } }),
      prisma.enrollment.count({ where: { tenantId, createdAt: range, couponId: { not: null } } }),
      prisma.enrollment.aggregate({
        where: { tenantId, createdAt: range, couponId: { not: null } },
        _sum: { discountAmount: true },
      }),
      prisma.coupon.findMany({
        where: { tenantId },
        orderBy: { usedCount: "desc" },
        take: 30,
        select: {
          code: true,
          discountType: true,
          discountValue: true,
          usedCount: true,
          maxUses: true,
          isActive: true,
        },
      }),
    ])

    const courseIds = byCourse.map((c) => c.courseId)
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, nome: true, categoriaLoja: true },
    })
    const courseById = new Map(courses.map((c) => [c.id, c]))
    const champion = byCourse[0] ? courseById.get(byCourse[0].courseId)?.nome ?? "—" : "—"

    const byCategory = new Map<string, number>()
    for (const c of byCourse) {
      const cat = courseById.get(c.courseId)?.categoriaLoja ?? "Sem categoria"
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(c._sum.finalAmount ?? 0))
    }

    const kpis: KpiDatum[] = [
      { key: "sold", label: "Cursos vendidos", value: byCourse.length, format: "number", icon: "book-open" },
      { key: "champion", label: "Curso campeão", value: 0, text: champion, format: "text", icon: "award" },
      { key: "coupons", label: "Cupons ativos", value: activeCoupons, format: "number", icon: "tag" },
      { key: "uses", label: "Cupons resgatados", value: couponUses, format: "number", icon: "percent" },
      {
        key: "discount",
        label: "Desconto concedido",
        value: Number(discountAgg._sum.discountAmount ?? 0),
        format: "currency",
        icon: "dollar-sign",
      },
    ]

    const series: ReportSeries[] = [
      {
        id: "top-cursos",
        kind: "bar",
        title: "Top 10 cursos por matrículas",
        xKey: "x",
        series: [{ key: "value", label: "Matrículas", format: "number" }],
        points: byCourse.slice(0, 10).map((c) => ({
          x: courseById.get(c.courseId)?.nome ?? "—",
          value: c._count._all,
        })),
      },
      {
        id: "por-categoria",
        kind: "donut",
        title: "Receita por categoria",
        xKey: "x",
        series: [{ key: "value", label: "Receita", format: "currency" }],
        points: [...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([x, value]) => ({ x, value })),
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "ranking-cursos",
        title: "Ranking de cursos",
        columns: [
          { key: "curso", label: "Curso" },
          { key: "matriculas", label: "Matrículas", format: "number", align: "right", sortable: true },
          { key: "receita", label: "Receita", format: "currency", align: "right", sortable: true },
          { key: "ticket", label: "Ticket médio", format: "currency", align: "right" },
        ],
        rows: byCourse.map((c) => {
          const count = c._count._all
          const receita = Number(c._sum.finalAmount ?? 0)
          return {
            curso: courseById.get(c.courseId)?.nome ?? "—",
            matriculas: count,
            receita,
            ticket: count > 0 ? receita / count : 0,
          }
        }),
      },
      {
        id: "cupons",
        title: "Cupons da unidade",
        columns: [
          { key: "code", label: "Código" },
          { key: "desconto", label: "Desconto" },
          { key: "usos", label: "Usos", format: "number", align: "right", sortable: true },
          { key: "limite", label: "Limite" },
          { key: "ativo", label: "Ativo" },
        ],
        rows: coupons.map((c) => ({
          code: c.code,
          desconto:
            c.discountType === "PERCENTAGE"
              ? `${Number(c.discountValue)}%`
              : `R$ ${Number(c.discountValue).toFixed(2)}`,
          usos: c.usedCount,
          limite: c.maxUses ? String(c.maxUses) : "∞",
          ativo: c.isActive ? "Sim" : "Não",
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
