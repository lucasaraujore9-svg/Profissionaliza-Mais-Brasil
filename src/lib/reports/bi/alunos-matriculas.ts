import { prisma } from "@/lib/prisma"
import { fillBuckets, toSeriesPoints } from "../bucket"
import { studentCountByBucket } from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type BiContext, type BiModule } from "./context"

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendente",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluída",
}

export const alunosMatriculasModule: BiModule = {
  async run(ctx: BiContext) {
    const { period } = ctx
    const range = { gte: period.start, lt: period.end }

    const [
      totalStudents,
      newStudents,
      newStudentsPrev,
      studentSeriesRows,
      enrollTotal,
      byStatus,
      approved,
      pmbEnroll,
      revendaEnroll,
      byUf,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.student.count({ where: { createdAt: range } }),
      prisma.student.count({
        where: { createdAt: { gte: period.previous.start, lt: period.previous.end } },
      }),
      studentCountByBucket({ start: period.start, end: period.end, bucket: period.bucket }),
      prisma.enrollment.count({ where: { createdAt: range } }),
      prisma.enrollment.groupBy({
        by: ["status"],
        where: { createdAt: range },
        _count: { _all: true },
      }),
      prisma.enrollment.count({
        where: { createdAt: range, status: { in: ["ACTIVE", "COMPLETED"] } },
      }),
      prisma.enrollment.count({ where: { createdAt: range, tenantId: null } }),
      prisma.enrollment.count({ where: { createdAt: range, tenantId: { not: null } } }),
      prisma.student.groupBy({
        by: ["estado"],
        where: { createdAt: range, estado: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { estado: "desc" } },
        take: 10,
      }),
    ])

    const completed = byStatus.find((s) => s.status === "COMPLETED")?._count._all ?? 0
    const cancelled = byStatus.find((s) => s.status === "CANCELLED")?._count._all ?? 0
    const conclusionRate = approved > 0 ? (completed / approved) * 100 : 0

    const kpis: KpiDatum[] = [
      { key: "total", label: "Base de alunos", value: totalStudents, format: "number", icon: "users" },
      {
        key: "new",
        label: "Alunos novos",
        value: newStudents,
        previousValue: newStudentsPrev,
        format: "number",
        icon: "user-plus",
      },
      { key: "enroll", label: "Matrículas criadas", value: enrollTotal, format: "number", icon: "graduation-cap" },
      { key: "approved", label: "Matrículas aprovadas", value: approved, format: "number", icon: "check-circle-2" },
      { key: "completed", label: "Taxa de conclusão", value: conclusionRate, format: "percent", icon: "award" },
      { key: "cancelled", label: "Canceladas", value: cancelled, format: "number", icon: "alert-triangle", invertDelta: true },
    ]

    const axis = fillBuckets(period.start, period.end, period.bucket)
    const series: ReportSeries[] = [
      {
        id: "students",
        kind: "area",
        title: "Novos alunos",
        subtitle: "Cadastros no período",
        xKey: "x",
        series: [{ key: "alunos", label: "Alunos", format: "number" }],
        points: toSeriesPoints(studentSeriesRows, axis, period.bucket, "alunos"),
      },
      {
        id: "status",
        kind: "bar",
        title: "Matrículas por status",
        xKey: "x",
        series: [{ key: "value", label: "Matrículas", format: "number" }],
        points: byStatus.map((s) => ({
          x: ENROLLMENT_STATUS_LABELS[s.status] ?? s.status,
          value: s._count._all,
        })),
      },
      {
        id: "origin",
        kind: "donut",
        title: "Origem das matrículas",
        xKey: "x",
        series: [{ key: "value", label: "Matrículas", format: "number" }],
        points: [
          { x: "Vitrine PMB", value: pmbEnroll },
          { x: "Revendedores", value: revendaEnroll },
        ],
      },
      {
        id: "uf",
        kind: "bar",
        title: "Alunos novos por UF",
        xKey: "x",
        series: [{ key: "value", label: "Alunos", format: "number" }],
        points: byUf.map((u) => ({ x: u.estado ?? "—", value: u._count._all })),
      },
    ]

    // Alunos agregados por revendedor (top por volume).
    const tenants = await prisma.tenant.findMany({
      where: { slug: { not: "__pmb__" } },
      select: { id: true, name: true, _count: { select: { students: true } } },
      orderBy: { students: { _count: "desc" } },
      take: 15,
    })
    const tables: ReportTable[] = [
      {
        id: "alunos-por-revenda",
        title: "Alunos por revendedor",
        subtitle: "Top 15 por volume",
        columns: [
          { key: "nome", label: "Revenda", href: "/admin/revendedores/{id}" },
          { key: "alunos", label: "Alunos", format: "number", align: "right", sortable: true },
        ],
        rows: tenants.map((t) => ({ id: t.id, nome: t.name, alunos: t._count.students })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
