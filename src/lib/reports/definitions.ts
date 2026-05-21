import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { brl, isoDate, isoDateTime } from "./csv"

export interface ReportFilters {
  from?: string
  to?: string
  tenantId?: string
}

export interface ReportData {
  header: string[]
  rows: unknown[][]
  filename: string
}

export interface ReportRunner {
  generate(filters: ReportFilters): Promise<ReportData>
}

export interface ReportDef {
  id: string
  group:
    | "Vendas"
    | "Alunos"
    | "Revendedores"
    | "Financeiro"
    | "Catálogo"
  label: string
  description: string
  filename: string
  needsSuperAdmin?: boolean
}

export const REPORT_DEFS: ReportDef[] = [
  // ── Vendas ──
  {
    id: "vendas-completas",
    group: "Vendas",
    label: "Todas as vendas",
    description:
      "Todas as matrículas (vitrine PMB + revendedores), com valores, desconto e status.",
    filename: "vendas-completas",
  },
  {
    id: "vendas-vitrine-pmb",
    group: "Vendas",
    label: "Vendas diretas — vitrine PMB",
    description:
      "Apenas vendas feitas pela vitrine principal e pelo painel administrativo (tenant_id = null).",
    filename: "vendas-vitrine-pmb",
  },
  {
    id: "vendas-revendedores",
    group: "Vendas",
    label: "Vendas dos revendedores",
    description:
      "Apenas vendas originadas em vitrines de revendedores. Inclui nome do revendedor.",
    filename: "vendas-revendedores",
  },
  {
    id: "cupons-utilizados",
    group: "Vendas",
    label: "Cupons utilizados",
    description:
      "Lista de cupons resgatados em matrículas, com desconto aplicado e quem criou o cupom.",
    filename: "cupons-utilizados",
  },

  // ── Alunos ──
  {
    id: "alunos-todos",
    group: "Alunos",
    label: "Todos os alunos",
    description:
      "Cadastros completos da base de alunos, com revendedor de origem, status e matrículas ativas.",
    filename: "alunos-todos",
  },
  {
    id: "alunos-vitrine-pmb",
    group: "Alunos",
    label: "Alunos da vitrine PMB",
    description:
      "Alunos cadastrados via vitrine principal ou venda direta admin.",
    filename: "alunos-vitrine-pmb",
  },
  {
    id: "alunos-por-revendedor",
    group: "Alunos",
    label: "Alunos agregados por revendedor",
    description:
      "Total de alunos por revendedor (ativos / bloqueados / formados).",
    filename: "alunos-por-revendedor",
  },

  // ── Revendedores ──
  {
    id: "revendedores-todos",
    group: "Revendedores",
    label: "Todos os revendedores",
    description:
      "Lista completa com plano, status, gerente, MRR contratual e contagem de alunos.",
    filename: "revendedores-todos",
    needsSuperAdmin: true,
  },
  {
    id: "revendedores-inadimplentes",
    group: "Revendedores",
    label: "Revendedores inadimplentes",
    description:
      "Revendedores com mensalidades vencidas ou status SUSPENDED no Asaas.",
    filename: "revendedores-inadimplentes",
    needsSuperAdmin: true,
  },

  // ── Financeiro ──
  {
    id: "pagamentos-recebidos",
    group: "Financeiro",
    label: "Pagamentos recebidos",
    description:
      "Pagamentos APROVADOS no período. Inclui gateway (MP/Asaas), aluno, curso e revendedor.",
    filename: "pagamentos-recebidos",
  },
  {
    id: "mensalidades-revendedores",
    group: "Financeiro",
    label: "Mensalidades de revendedores (Asaas)",
    description:
      "Histórico das cobranças mensais aos revendedores via Asaas, com status e datas.",
    filename: "mensalidades-revendedores",
    needsSuperAdmin: true,
  },
  {
    id: "mensalidades-em-atraso",
    group: "Financeiro",
    label: "Mensalidades em atraso",
    description: "Apenas mensalidades de revendedores com status OVERDUE.",
    filename: "mensalidades-em-atraso",
    needsSuperAdmin: true,
  },

  // ── Catálogo ──
  {
    id: "cursos-mais-vendidos",
    group: "Catálogo",
    label: "Cursos mais vendidos",
    description:
      "Ranking de cursos por número de matrículas pagas no período, com receita total.",
    filename: "cursos-mais-vendidos",
  },
  {
    id: "performance-por-curso",
    group: "Catálogo",
    label: "Performance por curso",
    description:
      "Por curso: matrículas, receita bruta e ticket médio. Inclui colunas para PMB e revendedores.",
    filename: "performance-por-curso",
  },
]

function dateFilter(filters: ReportFilters): {
  start?: Date
  end?: Date
} {
  return {
    start: filters.from ? new Date(filters.from) : undefined,
    end: filters.to ? new Date(filters.to + "T23:59:59") : undefined,
  }
}

const RUNNERS: Record<string, ReportRunner> = {
  "vendas-completas": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const where: Prisma.EnrollmentWhereInput = {
        ...(start || end
          ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
          : {}),
        ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
      }
      const rows = await prisma.enrollment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { nome: true, email: true, cpf: true } },
          course: { select: { nome: true, categoriaLoja: true } },
          tenant: { select: { name: true, slug: true } },
          coupon: { select: { code: true, discountType: true, discountValue: true } },
          soldByUser: { select: { name: true, email: true } },
        },
      })
      return {
        header: [
            "id",
            "criado_em",
            "vitrine",
            "revendedor",
            "aluno",
            "email",
            "cpf",
            "curso",
            "categoria",
            "tipo_pagamento",
            "gateway",
            "valor_original",
            "desconto",
            "valor_final",
            "cupom",
            "status",
            "vendedor",
            "external_reference",
          ],
          rows: rows.map((e) => [
            e.id,
            isoDateTime(e.createdAt),
            e.tenantId ? "Revendedor" : "PMB",
            e.tenant?.name ?? "Vitrine principal",
            e.student.nome,
            e.student.email ?? "",
            e.student.cpf ?? "",
            e.course.nome,
            e.course.categoriaLoja ?? "",
            e.paymentType,
            e.gateway,
            brl(Number(e.originalAmount)),
            brl(Number(e.discountAmount)),
            brl(Number(e.finalAmount)),
            e.coupon?.code ?? "",
            e.status,
            e.soldByUser?.name ?? "",
            e.externalReference ?? "",
          ]),
        filename: "vendas-completas",
      }
    },
  },

  "vendas-vitrine-pmb": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const rows = await prisma.enrollment.findMany({
        where: {
          tenantId: null,
          ...(start || end
            ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { nome: true, email: true, cpf: true } },
          course: { select: { nome: true } },
          coupon: { select: { code: true } },
          soldByUser: { select: { name: true } },
        },
      })
      return {
        header: [
            "criado_em",
            "aluno",
            "email",
            "cpf",
            "curso",
            "tipo_pagamento",
            "gateway",
            "valor_original",
            "desconto",
            "valor_final",
            "cupom",
            "status",
            "vendedor",
          ],
          rows: rows.map((e) => [
            isoDateTime(e.createdAt),
            e.student.nome,
            e.student.email ?? "",
            e.student.cpf ?? "",
            e.course.nome,
            e.paymentType,
            e.gateway,
            brl(Number(e.originalAmount)),
            brl(Number(e.discountAmount)),
            brl(Number(e.finalAmount)),
            e.coupon?.code ?? "",
            e.status,
            e.soldByUser?.name ?? "",
          ]),
        filename: "vendas-vitrine-pmb",
      }
    },
  },

  "vendas-revendedores": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const rows = await prisma.enrollment.findMany({
        where: {
          tenantId: { not: null },
          ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
          ...(start || end
            ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { nome: true, email: true } },
          course: { select: { nome: true } },
          tenant: { select: { name: true, slug: true } },
        },
      })
      return {
        header: [
            "criado_em",
            "revendedor",
            "slug",
            "aluno",
            "email",
            "curso",
            "tipo_pagamento",
            "gateway",
            "valor_final",
            "status",
          ],
          rows: rows.map((e) => [
            isoDateTime(e.createdAt),
            e.tenant?.name ?? "",
            e.tenant?.slug ?? "",
            e.student.nome,
            e.student.email ?? "",
            e.course.nome,
            e.paymentType,
            e.gateway,
            brl(Number(e.finalAmount)),
            e.status,
          ]),
        filename: "vendas-revendedores",
      }
    },
  },

  "cupons-utilizados": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const rows = await prisma.enrollment.findMany({
        where: {
          couponId: { not: null },
          ...(start || end
            ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          student: { select: { nome: true } },
          course: { select: { nome: true } },
          tenant: { select: { name: true } },
          coupon: {
            select: {
              code: true,
              discountType: true,
              discountValue: true,
              createdByUser: { select: { name: true } },
              createdByRole: true,
            },
          },
        },
      })
      return {
        header: [
            "criado_em",
            "cupom",
            "tipo_desconto",
            "valor_desconto",
            "criado_por",
            "papel_criador",
            "vitrine",
            "aluno",
            "curso",
            "valor_aplicado",
            "valor_final",
          ],
          rows: rows.map((e) => [
            isoDateTime(e.createdAt),
            e.coupon?.code ?? "",
            e.coupon?.discountType ?? "",
            e.coupon?.discountType === "PERCENTAGE"
              ? `${e.coupon.discountValue}%`
              : brl(Number(e.coupon?.discountValue ?? 0)),
            e.coupon?.createdByUser?.name ?? "",
            e.coupon?.createdByRole ?? "",
            e.tenant?.name ?? "Vitrine principal",
            e.student.nome,
            e.course.nome,
            brl(Number(e.discountAmount)),
            brl(Number(e.finalAmount)),
          ]),
        filename: "cupons-utilizados",
      }
    },
  },

  "alunos-todos": {
    async generate(filters) {
      const rows = await prisma.student.findMany({
        where: filters.tenantId ? { tenantId: filters.tenantId } : undefined,
        orderBy: { createdAt: "desc" },
        include: {
          tenant: { select: { name: true, slug: true } },
          _count: {
            select: {
              enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
            },
          },
        },
      })
      return {
        header: [
            "criado_em",
            "vitrine",
            "nome",
            "email",
            "fone",
            "cpf",
            "cidade",
            "estado",
            "status",
            "matriculas_ativas",
            "id_plataforma",
          ],
          rows: rows.map((s) => [
            isoDate(s.createdAt),
            s.tenant.slug === "__pmb__" ? "Vitrine PMB" : s.tenant.name,
            s.nome,
            s.email ?? "",
            s.fone ?? "",
            s.cpf ?? "",
            s.cidade ?? "",
            s.estado ?? "",
            s.status,
            s._count.enrollments,
            s.plataformaAlunoId ?? "",
          ]),
        filename: "alunos-todos",
      }
    },
  },

  "alunos-vitrine-pmb": {
    async generate() {
      const rows = await prisma.student.findMany({
        where: { tenant: { slug: "__pmb__" } },
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              enrollments: { where: { status: { in: ["ACTIVE", "COMPLETED"] } } },
            },
          },
        },
      })
      return {
        header: ["criado_em", "nome", "email", "fone", "cpf", "status", "matriculas"],
          rows: rows.map((s) => [
            isoDate(s.createdAt),
            s.nome,
            s.email ?? "",
            s.fone ?? "",
            s.cpf ?? "",
            s.status,
            s._count.enrollments,
          ]),
        filename: "alunos-vitrine-pmb",
      }
    },
  },

  "alunos-por-revendedor": {
    async generate() {
      const tenants = await prisma.tenant.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          students: {
            select: { status: true },
          },
        },
      })
      return {
        header: [
            "revendedor",
            "slug",
            "status_revendedor",
            "total",
            "ativos",
            "bloqueados",
            "devedores",
            "formados",
          ],
          rows: tenants.map((t) => {
            const total = t.students.length
            const count = (s: string): number =>
              t.students.filter((x) => x.status === s).length
            return [
              t.slug === "__pmb__" ? "Vitrine PMB" : t.name,
              t.slug,
              t.status,
              total,
              count("ATIVO"),
              count("BLOQUEADO"),
              count("DEVEDOR"),
              count("FORMADO"),
            ]
          }),
        filename: "alunos-por-revendedor",
      }
    },
  },

  "revendedores-todos": {
    async generate() {
      const tenants = await prisma.tenant.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          owner: { select: { name: true, email: true } },
          accountManager: { select: { name: true } },
          _count: { select: { students: true } },
        },
      })
      return {
        header: [
            "criado_em",
            "nome",
            "slug",
            "status",
            "billing_mode",
            "owner_nome",
            "owner_email",
            "account_manager",
            "plan_value",
            "total_alunos",
            "asaas_subscription_id",
          ],
          rows: tenants
            .filter((t) => t.slug !== "__pmb__")
            .map((t) => [
              isoDate(t.createdAt),
              t.name,
              t.slug,
              t.status,
              t.billingMode,
              t.owner?.name ?? "",
              t.owner?.email ?? "",
              t.accountManager?.name ?? "",
              brl(Number(t.planValue)),
              t._count.students,
              t.asaasSubscriptionId ?? "",
            ]),
        filename: "revendedores-todos",
      }
    },
  },

  "revendedores-inadimplentes": {
    async generate() {
      const tenants = await prisma.tenant.findMany({
        where: { status: { in: ["SUSPENDED", "CANCELLED"] } },
        orderBy: { updatedAt: "desc" },
        include: {
          owner: { select: { name: true, email: true } },
          accountManager: { select: { name: true } },
          tenantPayments: {
            where: { status: "OVERDUE" },
            select: { amount: true, dueDate: true },
            orderBy: { dueDate: "desc" },
            take: 1,
          },
        },
      })
      return {
        header: [
            "nome",
            "slug",
            "status",
            "owner_nome",
            "owner_email",
            "account_manager",
            "plan_value",
            "ultimo_vencimento",
            "valor_em_atraso",
          ],
          rows: tenants
            .filter((t) => t.slug !== "__pmb__")
            .map((t) => [
              t.name,
              t.slug,
              t.status,
              t.owner?.name ?? "",
              t.owner?.email ?? "",
              t.accountManager?.name ?? "",
              brl(Number(t.planValue)),
              isoDate(t.tenantPayments[0]?.dueDate ?? null),
              brl(Number(t.tenantPayments[0]?.amount ?? 0)),
            ]),
        filename: "revendedores-inadimplentes",
      }
    },
  },

  "pagamentos-recebidos": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const rows = await prisma.payment.findMany({
        where: {
          mpStatus: "APPROVED",
          ...(start || end
            ? { paidAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
          ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
        },
        orderBy: { paidAt: "desc" },
        include: {
          enrollment: {
            include: {
              student: { select: { nome: true, email: true } },
              course: { select: { nome: true } },
              tenant: { select: { name: true, slug: true } },
            },
          },
          soldByUser: { select: { name: true } },
        },
      })
      return {
        header: [
            "data_pagamento",
            "vitrine",
            "revendedor",
            "aluno",
            "email",
            "curso",
            "valor",
            "tipo",
            "gateway",
            "mp_payment_id",
            "asaas_payment_id",
            "vendedor",
          ],
          rows: rows.map((p) => [
            isoDateTime(p.paidAt ?? p.createdAt),
            p.enrollment.tenant ? "Revendedor" : "PMB",
            p.enrollment.tenant?.name ?? "Vitrine principal",
            p.enrollment.student.nome,
            p.enrollment.student.email ?? "",
            p.enrollment.course.nome,
            brl(Number(p.amount)),
            p.type,
            p.gateway,
            p.mpPaymentId ?? "",
            p.asaasPaymentId ?? "",
            p.soldByUser?.name ?? "",
          ]),
        filename: "pagamentos-recebidos",
      }
    },
  },

  "mensalidades-revendedores": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const rows = await prisma.tenantPayment.findMany({
        where: {
          ...(start || end
            ? { dueDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
        },
        orderBy: { dueDate: "desc" },
        include: { tenant: { select: { name: true, slug: true } } },
      })
      return {
        header: [
            "vencimento",
            "pago_em",
            "revendedor",
            "slug",
            "valor",
            "tipo_cobranca",
            "status",
            "asaas_payment_id",
          ],
          rows: rows.map((p) => [
            isoDate(p.dueDate),
            isoDate(p.paidAt),
            p.tenant.name,
            p.tenant.slug,
            brl(Number(p.amount)),
            p.billingType,
            p.status,
            p.asaasPaymentId,
          ]),
        filename: "mensalidades-revendedores",
      }
    },
  },

  "mensalidades-em-atraso": {
    async generate() {
      const rows = await prisma.tenantPayment.findMany({
        where: { status: "OVERDUE" },
        orderBy: { dueDate: "asc" },
        include: {
          tenant: {
            select: {
              name: true,
              slug: true,
              owner: { select: { name: true, email: true } },
            },
          },
        },
      })
      return {
        header: [
            "vencimento",
            "revendedor",
            "owner_nome",
            "owner_email",
            "valor",
            "tipo_cobranca",
            "asaas_payment_id",
          ],
          rows: rows.map((p) => [
            isoDate(p.dueDate),
            p.tenant.name,
            p.tenant.owner?.name ?? "",
            p.tenant.owner?.email ?? "",
            brl(Number(p.amount)),
            p.billingType,
            p.asaasPaymentId,
          ]),
        filename: "mensalidades-em-atraso",
      }
    },
  },

  "cursos-mais-vendidos": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const grouped = await prisma.enrollment.groupBy({
        by: ["courseId"],
        where: {
          status: { in: ["ACTIVE", "COMPLETED"] },
          ...(start || end
            ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
        },
        _count: { _all: true },
        _sum: { finalAmount: true },
        orderBy: { _count: { courseId: "desc" } },
      })
      const courses = await prisma.course.findMany({
        where: { id: { in: grouped.map((g) => g.courseId) } },
        select: { id: true, nome: true, categoriaLoja: true },
      })
      const map = new Map(courses.map((c) => [c.id, c]))
      return {
        header: ["posicao", "curso", "categoria", "matriculas", "receita_total"],
          rows: grouped.map((g, i) => [
            i + 1,
            map.get(g.courseId)?.nome ?? g.courseId,
            map.get(g.courseId)?.categoriaLoja ?? "",
            g._count._all,
            brl(Number(g._sum.finalAmount ?? 0)),
          ]),
        filename: "cursos-mais-vendidos",
      }
    },
  },

  "performance-por-curso": {
    async generate(filters) {
      const { start, end } = dateFilter(filters)
      const enrollments = await prisma.enrollment.findMany({
        where: {
          status: { in: ["ACTIVE", "COMPLETED"] },
          ...(start || end
            ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } }
            : {}),
        },
        select: {
          finalAmount: true,
          tenantId: true,
          courseId: true,
        },
      })
      const courses = await prisma.course.findMany({
        select: { id: true, nome: true, categoriaLoja: true, status: true },
      })
      type Row = {
        nome: string
        categoria: string
        status: string
        pmbCount: number
        pmbRevenue: number
        resellerCount: number
        resellerRevenue: number
      }
      const acc = new Map<string, Row>()
      for (const c of courses) {
        acc.set(c.id, {
          nome: c.nome,
          categoria: c.categoriaLoja ?? "",
          status: c.status,
          pmbCount: 0,
          pmbRevenue: 0,
          resellerCount: 0,
          resellerRevenue: 0,
        })
      }
      for (const e of enrollments) {
        const row = acc.get(e.courseId)
        if (!row) continue
        const amount = Number(e.finalAmount)
        if (e.tenantId === null) {
          row.pmbCount += 1
          row.pmbRevenue += amount
        } else {
          row.resellerCount += 1
          row.resellerRevenue += amount
        }
      }
      const arr = [...acc.values()].sort(
        (a, b) =>
          b.pmbCount + b.resellerCount - (a.pmbCount + a.resellerCount),
      )
      return {
        header: [
            "curso",
            "categoria",
            "status",
            "matriculas_pmb",
            "receita_pmb",
            "matriculas_revendedores",
            "receita_revendedores",
            "ticket_medio",
          ],
          rows: arr.map((r) => {
            const total = r.pmbCount + r.resellerCount
            const ticket =
              total > 0 ? (r.pmbRevenue + r.resellerRevenue) / total : 0
            return [
              r.nome,
              r.categoria,
              r.status,
              r.pmbCount,
              brl(r.pmbRevenue),
              r.resellerCount,
              brl(r.resellerRevenue),
              brl(ticket),
            ]
          }),
        filename: "performance-por-curso",
      }
    },
  },
}

export function getReportRunner(id: string): ReportRunner | null {
  return RUNNERS[id] ?? null
}
