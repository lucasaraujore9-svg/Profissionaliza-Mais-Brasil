import { prisma } from "@/lib/prisma"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

export const cursosCuponsModule: BiModule = {
  async run(ctx: BiContext) {
    const { period } = ctx
    const range = { gte: period.start, lt: period.end }

    const [activeCourses, byCourse, couponUses, discountAgg, coupons] = await Promise.all([
      prisma.course.count({ where: { status: "ATIVO" } }),
      prisma.enrollment.groupBy({
        by: ["courseId"],
        where: { createdAt: range, status: { in: ["ACTIVE", "COMPLETED"] } },
        _count: { _all: true },
        _sum: { finalAmount: true },
        orderBy: { _count: { courseId: "desc" } },
        take: 50,
      }),
      prisma.enrollment.count({ where: { createdAt: range, couponId: { not: null } } }),
      prisma.enrollment.aggregate({
        _sum: { discountAmount: true },
        where: { createdAt: range, couponId: { not: null } },
      }),
      prisma.coupon.findMany({
        orderBy: { usedCount: "desc" },
        take: 30,
        select: {
          code: true,
          discountType: true,
          discountValue: true,
          usedCount: true,
          maxUses: true,
          isActive: true,
          tenant: { select: { name: true, slug: true } },
        },
      }),
    ])

    const courseIds = byCourse.map((c) => c.courseId)
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, nome: true, categoriaLoja: true },
    })
    const courseById = new Map(courses.map((c) => [c.id, c]))

    const champion = byCourse[0]
      ? courseById.get(byCourse[0].courseId)?.nome ?? "—"
      : "—"

    // Receita por categoria (agregação em JS).
    const byCategory = new Map<string, number>()
    for (const c of byCourse) {
      const cat = courseById.get(c.courseId)?.categoriaLoja ?? "Sem categoria"
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + Number(c._sum.finalAmount ?? 0))
    }

    const kpis: KpiDatum[] = [
      { key: "active", label: "Cursos ativos", value: activeCourses, format: "number", icon: "book-open" },
      { key: "champion", label: "Curso campeão", value: 0, text: champion, format: "text", icon: "award" },
      { key: "coupons", label: "Cupons resgatados", value: couponUses, format: "number", icon: "tag" },
      {
        key: "discount",
        label: "Desconto concedido",
        value: Number(discountAgg._sum.discountAmount ?? 0),
        format: "currency",
        icon: "percent",
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
        id: "performance-curso",
        title: "Performance por curso",
        subtitle: "Matrículas pagas no período",
        columns: [
          { key: "curso", label: "Curso" },
          { key: "categoria", label: "Categoria" },
          { key: "matriculas", label: "Matrículas", format: "number", align: "right", sortable: true },
          { key: "receita", label: "Receita", format: "currency", align: "right", sortable: true },
          { key: "ticket", label: "Ticket médio", format: "currency", align: "right" },
        ],
        rows: byCourse.map((c) => {
          const count = c._count._all
          const receita = Number(c._sum.finalAmount ?? 0)
          return {
            curso: courseById.get(c.courseId)?.nome ?? "—",
            categoria: courseById.get(c.courseId)?.categoriaLoja ?? "—",
            matriculas: count,
            receita,
            ticket: count > 0 ? receita / count : 0,
          }
        }),
      },
      {
        id: "cupons",
        title: "Cupons",
        subtitle: "Uso acumulado",
        columns: [
          { key: "code", label: "Código" },
          { key: "origem", label: "Origem" },
          { key: "desconto", label: "Desconto" },
          { key: "usos", label: "Usos", format: "number", align: "right", sortable: true },
          { key: "ativo", label: "Ativo" },
        ],
        rows: coupons.map((c) => ({
          code: c.code,
          origem: c.tenant ? c.tenant.name : "Vitrine PMB",
          desconto:
            c.discountType === "PERCENTAGE"
              ? `${Number(c.discountValue)}%`
              : `R$ ${Number(c.discountValue).toFixed(2)}`,
          usos: c.usedCount,
          ativo: c.isActive ? "Sim" : "Não",
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
