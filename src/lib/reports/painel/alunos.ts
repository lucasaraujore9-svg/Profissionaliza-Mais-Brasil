import { prisma } from "@/lib/prisma"
import { fillBuckets, toSeriesPoints } from "../bucket"
import { studentCountByBucket } from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type PainelBiContext, type PainelBiModule } from "./context"

export const alunosModule: PainelBiModule = {
  async run(ctx: PainelBiContext) {
    const { period, tenantId } = ctx
    const range = { gte: period.start, lt: period.end }

    const [
      base,
      novos,
      novosPrev,
      studentSeriesRows,
      enrollTotal,
      byStatus,
      byCourse,
      students,
    ] = await Promise.all([
      prisma.student.count({ where: { tenantId } }),
      prisma.student.count({ where: { tenantId, createdAt: range } }),
      prisma.student.count({
        where: { tenantId, createdAt: { gte: period.previous.start, lt: period.previous.end } },
      }),
      studentCountByBucket({ start: period.start, end: period.end, bucket: period.bucket, tenantId }),
      prisma.enrollment.count({ where: { tenantId, createdAt: range } }),
      prisma.enrollment.groupBy({
        by: ["status"],
        where: { tenantId, createdAt: range },
        _count: { _all: true },
      }),
      prisma.enrollment.groupBy({
        by: ["courseId"],
        where: { tenantId, createdAt: range },
        _count: { _all: true },
        orderBy: { _count: { courseId: "desc" } },
        take: 10,
      }),
      prisma.student.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          nome: true,
          status: true,
          createdAt: true,
          _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } } },
        },
      }),
    ])

    const countOf = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0

    const kpis: KpiDatum[] = [
      { key: "base", label: "Base de alunos", value: base, format: "number", icon: "users" },
      { key: "novos", label: "Alunos novos", value: novos, previousValue: novosPrev, format: "number", icon: "user-plus" },
      { key: "criadas", label: "Matrículas criadas", value: enrollTotal, format: "number", icon: "graduation-cap" },
      { key: "aprovadas", label: "Aprovadas", value: countOf("ACTIVE") + countOf("COMPLETED"), format: "number", icon: "check-circle-2" },
      { key: "pendentes", label: "Pendentes", value: countOf("PENDING"), format: "number", icon: "clock" },
      { key: "canceladas", label: "Canceladas", value: countOf("CANCELLED"), format: "number", icon: "alert-triangle", invertDelta: true },
    ]

    const courseIds = byCourse.map((c) => c.courseId)
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, nome: true },
    })
    const courseName = new Map(courses.map((c) => [c.id, c.nome]))

    const axis = fillBuckets(period.start, period.end, period.bucket)
    const series: ReportSeries[] = [
      {
        id: "students",
        kind: "area",
        title: "Novos alunos",
        xKey: "x",
        series: [{ key: "alunos", label: "Alunos", format: "number" }],
        points: toSeriesPoints(studentSeriesRows, axis, period.bucket, "alunos"),
      },
      {
        id: "funnel",
        kind: "funnel",
        title: "Matrículas por status",
        xKey: "x",
        series: [{ key: "value", label: "Matrículas", format: "number" }],
        points: [
          { x: "Pendentes", value: countOf("PENDING") },
          { x: "Ativas", value: countOf("ACTIVE") },
          { x: "Concluídas", value: countOf("COMPLETED") },
          { x: "Canceladas", value: countOf("CANCELLED") },
        ],
      },
      {
        id: "by-course",
        kind: "bar",
        title: "Matrículas por curso",
        xKey: "x",
        series: [{ key: "value", label: "Matrículas", format: "number" }],
        points: byCourse.map((c) => ({ x: courseName.get(c.courseId) ?? "—", value: c._count._all })),
      },
    ]

    const tables: ReportTable[] = [
      {
        id: "alunos",
        title: "Alunos",
        subtitle: "Até 100 mais recentes",
        columns: [
          { key: "nome", label: "Aluno", href: "/painel/alunos/{id}" },
          { key: "status", label: "Status" },
          { key: "matriculas", label: "Matrículas ativas", format: "number", align: "right", sortable: true },
          { key: "data", label: "Cadastro", format: "text", sortable: true },
        ],
        rows: students.map((s) => ({
          id: s.id,
          nome: s.nome,
          // Student.status é StudentStatus (ATIVO/INATIVO/…), já em pt — exibe raw.
          status: s.status,
          matriculas: s._count.enrollments,
          data: s.createdAt.toISOString().slice(0, 10),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
