import { prisma } from "@/lib/prisma"
import { fillBuckets, toSeriesPoints } from "../bucket"
import {
  approvedRevenueByBucket,
  approvedRevenueTotal,
  enrollmentCountByBucket,
} from "../aggregations"
import type { KpiDatum, ReportSeries, ReportTable } from "../types"
import { buildPayload, type PainelBiContext, type PainelBiModule } from "./context"

export const visaoGeralModule: PainelBiModule = {
  async run(ctx: PainelBiContext) {
    const { period, tenantId } = ctx
    const range = { gte: period.start, lt: period.end }

    const [
      revenue,
      revenuePrev,
      revSeriesRows,
      enrollSeriesRows,
      newStudents,
      newStudentsPrev,
      enrollTotal,
      enrollApproved,
      paymentsCount,
      pendingAgg,
      topCourses,
      recent,
    ] = await Promise.all([
      approvedRevenueTotal({ start: period.start, end: period.end, tenantId }),
      approvedRevenueTotal({ start: period.previous.start, end: period.previous.end, tenantId }),
      approvedRevenueByBucket({ start: period.start, end: period.end, bucket: period.bucket, tenantId }),
      enrollmentCountByBucket({ start: period.start, end: period.end, bucket: period.bucket, tenantId }),
      prisma.student.count({ where: { tenantId, createdAt: range } }),
      prisma.student.count({
        where: { tenantId, createdAt: { gte: period.previous.start, lt: period.previous.end } },
      }),
      prisma.enrollment.count({ where: { tenantId, createdAt: range } }),
      prisma.enrollment.count({
        where: { tenantId, createdAt: range, status: { in: ["ACTIVE", "COMPLETED"] } },
      }),
      prisma.payment.count({
        where: { tenantId, mpStatus: "APPROVED", paidAt: range },
      }),
      prisma.enrollment.aggregate({
        where: { tenantId, status: "PENDING" },
        _sum: { finalAmount: true },
      }),
      prisma.enrollment.groupBy({
        by: ["courseId"],
        where: { tenantId, createdAt: range, status: { in: ["ACTIVE", "COMPLETED"] } },
        _count: { _all: true },
        _sum: { finalAmount: true },
        orderBy: { _sum: { finalAmount: "desc" } },
        take: 5,
      }),
      prisma.enrollment.findMany({
        where: { tenantId, status: { in: ["ACTIVE", "COMPLETED"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          finalAmount: true,
          createdAt: true,
          status: true,
          student: { select: { nome: true } },
          course: { select: { nome: true } },
        },
      }),
    ])

    const conversion = enrollTotal > 0 ? (enrollApproved / enrollTotal) * 100 : 0
    const ticket = paymentsCount > 0 ? revenue / paymentsCount : 0

    const kpis: KpiDatum[] = [
      {
        key: "revenue",
        label: "Receita no período",
        value: revenue,
        previousValue: revenuePrev,
        format: "currency",
        icon: "dollar-sign",
      },
      {
        key: "students",
        label: "Alunos novos",
        value: newStudents,
        previousValue: newStudentsPrev,
        format: "number",
        icon: "user-plus",
      },
      { key: "approved", label: "Matrículas aprovadas", value: enrollApproved, format: "number", icon: "check-circle-2" },
      { key: "conversion", label: "Conversão", value: conversion, format: "percent", icon: "target", hint: `${enrollApproved}/${enrollTotal}` },
      { key: "ticket", label: "Ticket médio", value: ticket, format: "currency", icon: "receipt" },
      {
        key: "toReceive",
        label: "A receber (pendente)",
        value: Number(pendingAgg._sum.finalAmount ?? 0),
        format: "currency",
        icon: "clock",
      },
    ]

    const axis = fillBuckets(period.start, period.end, period.bucket)
    const series: ReportSeries[] = [
      {
        id: "revenue",
        kind: "area",
        title: "Receita no período",
        subtitle: "Pagamentos aprovados",
        xKey: "x",
        series: [{ key: "receita", label: "Receita", format: "currency" }],
        points: toSeriesPoints(revSeriesRows, axis, period.bucket, "receita"),
      },
      {
        id: "enroll",
        kind: "bar",
        title: "Matrículas por período",
        xKey: "x",
        series: [{ key: "matriculas", label: "Matrículas", format: "number" }],
        points: toSeriesPoints(enrollSeriesRows, axis, period.bucket, "matriculas"),
      },
    ]

    const courseIds = topCourses.map((c) => c.courseId)
    const courses = await prisma.course.findMany({
      where: { id: { in: courseIds } },
      select: { id: true, nome: true },
    })
    const courseName = new Map(courses.map((c) => [c.id, c.nome]))

    const tables: ReportTable[] = [
      {
        id: "top-cursos",
        title: "Top cursos por receita",
        columns: [
          { key: "curso", label: "Curso" },
          { key: "matriculas", label: "Matrículas", format: "number", align: "right", sortable: true },
          { key: "receita", label: "Receita", format: "currency", align: "right", sortable: true },
        ],
        rows: topCourses.map((c) => ({
          curso: courseName.get(c.courseId) ?? "—",
          matriculas: c._count._all,
          receita: Number(c._sum.finalAmount ?? 0),
        })),
      },
      {
        id: "vendas-recentes",
        title: "Vendas recentes",
        columns: [
          { key: "aluno", label: "Aluno" },
          { key: "curso", label: "Curso" },
          { key: "valor", label: "Valor", format: "currency", align: "right" },
          { key: "data", label: "Data", format: "text" },
        ],
        rows: recent.map((e) => ({
          aluno: e.student.nome,
          curso: e.course.nome,
          valor: Number(e.finalAmount),
          data: e.createdAt.toISOString().slice(0, 10),
        })),
      },
    ]

    return buildPayload(period, { kpis, series, tables })
  },
}
