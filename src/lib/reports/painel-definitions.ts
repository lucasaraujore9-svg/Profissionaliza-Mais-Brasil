import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { brl, isoDate, isoDateTime } from "./csv"

/**
 * Registro de relatórios CSV do PAINEL (revenda). Diferença de segurança vs. o
 * registro do admin: `tenantId` é OBRIGATÓRIO em todo filtro, e cada runner
 * lança se ele faltar — um export cross-tenant é estruturalmente impossível.
 */
export interface PainelReportDef {
  id: string
  label: string
  description: string
  /** Só o dono da unidade pode gerar (consultores não). */
  ownerOnly?: boolean
}

export interface PainelReportFilters {
  tenantId: string
  from?: string
  to?: string
}

export interface PainelReportData {
  header: string[]
  rows: unknown[][]
  filename: string
}

export interface PainelReportRunner {
  generate(filters: PainelReportFilters): Promise<PainelReportData>
}

const MAX_ROWS = 10_000

export const PAINEL_REPORT_DEFS: PainelReportDef[] = [
  { id: "vendas", label: "Vendas (matrículas)", description: "Matrículas da unidade com aluno, curso, valores e status." },
  { id: "alunos", label: "Alunos", description: "Base de alunos da unidade com status e matrículas ativas." },
  { id: "pagamentos", label: "Pagamentos recebidos", description: "Pagamentos aprovados no período." },
  { id: "cupons", label: "Cupons", description: "Cupons da unidade com uso acumulado." },
  { id: "cursos", label: "Cursos mais vendidos", description: "Ranking de cursos por matrículas pagas." },
]

function requireTenant(filters: PainelReportFilters): string {
  if (!filters.tenantId) {
    throw new Error("painel-definitions: tenantId é obrigatório (bloqueio anti-cross-tenant)")
  }
  return filters.tenantId
}

function dateRange(filters: PainelReportFilters): { gte?: Date; lte?: Date } | undefined {
  const start = filters.from ? new Date(filters.from) : undefined
  const end = filters.to ? new Date(filters.to + "T23:59:59") : undefined
  if (!start && !end) return undefined
  return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) }
}

const RUNNERS: Record<string, PainelReportRunner> = {
  vendas: {
    async generate(filters) {
      const tenantId = requireTenant(filters)
      const range = dateRange(filters)
      const where: Prisma.EnrollmentWhereInput = {
        tenantId,
        ...(range ? { createdAt: range } : {}),
      }
      const rows = await prisma.enrollment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: {
          student: { select: { nome: true, email: true } },
          course: { select: { nome: true } },
          coupon: { select: { code: true } },
        },
      })
      return {
        header: ["criado_em", "aluno", "email", "curso", "tipo", "gateway", "valor_final", "cupom", "status"],
        rows: rows.map((e) => [
          isoDateTime(e.createdAt),
          e.student.nome,
          e.student.email ?? "",
          e.course.nome,
          e.paymentType,
          e.gateway,
          brl(Number(e.finalAmount)),
          e.coupon?.code ?? "",
          e.status,
        ]),
        filename: "vendas",
      }
    },
  },

  alunos: {
    async generate(filters) {
      const tenantId = requireTenant(filters)
      const rows = await prisma.student.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: MAX_ROWS,
        include: {
          _count: { select: { enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } } } },
        },
      })
      return {
        header: ["criado_em", "nome", "email", "fone", "cidade", "estado", "status", "matriculas_ativas"],
        rows: rows.map((s) => [
          isoDate(s.createdAt),
          s.nome,
          s.email ?? "",
          s.fone ?? "",
          s.cidade ?? "",
          s.estado ?? "",
          s.status,
          s._count.enrollments,
        ]),
        filename: "alunos",
      }
    },
  },

  pagamentos: {
    async generate(filters) {
      const tenantId = requireTenant(filters)
      const range = dateRange(filters)
      const rows = await prisma.payment.findMany({
        where: { tenantId, mpStatus: "APPROVED", ...(range ? { paidAt: range } : {}) },
        orderBy: { paidAt: "desc" },
        take: MAX_ROWS,
        include: {
          enrollment: {
            include: {
              student: { select: { nome: true } },
              course: { select: { nome: true } },
            },
          },
        },
      })
      return {
        header: ["data_pagamento", "aluno", "curso", "valor", "tipo", "gateway"],
        rows: rows.map((p) => [
          isoDateTime(p.paidAt ?? p.createdAt),
          p.enrollment.student.nome,
          p.enrollment.course.nome,
          brl(Number(p.amount)),
          p.type,
          p.gateway,
        ]),
        filename: "pagamentos",
      }
    },
  },

  cupons: {
    async generate(filters) {
      const tenantId = requireTenant(filters)
      const rows = await prisma.coupon.findMany({
        where: { tenantId },
        orderBy: { usedCount: "desc" },
        take: MAX_ROWS,
      })
      return {
        header: ["codigo", "tipo_desconto", "valor_desconto", "usos", "limite", "ativo"],
        rows: rows.map((c) => [
          c.code,
          c.discountType,
          c.discountType === "PERCENTAGE" ? `${Number(c.discountValue)}%` : brl(Number(c.discountValue)),
          c.usedCount,
          c.maxUses ?? "ilimitado",
          c.isActive ? "sim" : "nao",
        ]),
        filename: "cupons",
      }
    },
  },

  cursos: {
    async generate(filters) {
      const tenantId = requireTenant(filters)
      const range = dateRange(filters)
      const grouped = await prisma.enrollment.groupBy({
        by: ["courseId"],
        where: {
          tenantId,
          status: { in: ["ACTIVE", "COMPLETED"] },
          ...(range ? { createdAt: range } : {}),
        },
        _count: { _all: true },
        _sum: { finalAmount: true },
        orderBy: { _count: { courseId: "desc" } },
        take: MAX_ROWS,
      })
      const courses = await prisma.course.findMany({
        where: { id: { in: grouped.map((g) => g.courseId) } },
        select: { id: true, nome: true },
      })
      const byId = new Map(courses.map((c) => [c.id, c.nome]))
      return {
        header: ["posicao", "curso", "matriculas", "receita_total"],
        rows: grouped.map((g, i) => [
          i + 1,
          byId.get(g.courseId) ?? g.courseId,
          g._count._all,
          brl(Number(g._sum.finalAmount ?? 0)),
        ]),
        filename: "cursos-mais-vendidos",
      }
    },
  },
}

export function getPainelReportRunner(id: string): PainelReportRunner | null {
  return RUNNERS[id] ?? null
}

export function painelReportDef(id: string): PainelReportDef | undefined {
  return PAINEL_REPORT_DEFS.find((d) => d.id === id)
}
