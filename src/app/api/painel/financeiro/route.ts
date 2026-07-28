import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.financeiro.get", route: "/api/painel/financeiro" },
  async (request: Request) => {
    const guard = await requirePainel("financeiro.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const status = searchParams.get("status")
    const paymentType = searchParams.get("type")

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfLastWeek = new Date(now)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 6)

    const dateFrom = from ? new Date(from) : startOfMonth
    const dateTo = to ? new Date(to + "T23:59:59") : now

    // Vendas pendentes (PIX/boleto aguardando, cartao em analise) existem como
    // Enrollment PENDING mas ainda NAO geraram linha em Payment — esta so e criada
    // na aprovacao. Sem isso, a lista de pagamentos (que vem de `payment`) nunca
    // mostraria pendentes, embora o card "Pendente" e o dashboard as contem.
    // Incluimos as pendentes apenas quando o filtro permite (Todos ou Pendente).
    const includePending = !status || status === "PENDING"

    const [
      monthApproved,
      pendingAgg,
      allTimeAgg,
      dailyRevenueRaw,
      weeklyRevenueRaw,
      payments,
      pendingEnrollments,
    ] = await Promise.all([
        prisma.payment.aggregate({
          where: {
            tenantId: ctx.tenantId,
            mpStatus: "APPROVED",
            paidAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
        prisma.enrollment.aggregate({
          where: {
            tenantId: ctx.tenantId,
            status: "PENDING",
          },
          _sum: { finalAmount: true },
        }),
        prisma.payment.aggregate({
          where: {
            tenantId: ctx.tenantId,
            mpStatus: "APPROVED",
          },
          _sum: { amount: true },
        }),
        prisma.$queryRaw<{ day: Date; revenue: number }[]>`
          SELECT date_trunc('day', "paid_at") AS day,
                 COALESCE(SUM(amount)::float, 0) AS revenue
          FROM "payments"
          WHERE "tenant_id" = ${ctx.tenantId}
            AND "mp_status" = 'APPROVED'
            AND "paid_at" >= ${startOfLastWeek}
            AND "paid_at" IS NOT NULL
          GROUP BY day
          ORDER BY day ASC
        `,
        prisma.$queryRaw<{ week: Date; revenue: number }[]>`
          SELECT date_trunc('week', "paid_at") AS week,
                 COALESCE(SUM(amount)::float, 0) AS revenue
          FROM "payments"
          WHERE "tenant_id" = ${ctx.tenantId}
            AND "mp_status" = 'APPROVED'
            AND "paid_at" >= ${new Date(now.getFullYear(), now.getMonth() - 1, 1)}
            AND "paid_at" IS NOT NULL
          GROUP BY week
          ORDER BY week ASC
        `,
        prisma.payment.findMany({
          where: {
            tenantId: ctx.tenantId,
            ...(dateFrom || dateTo
              ? {
                  OR: [
                    {
                      paidAt: {
                        ...(dateFrom ? { gte: dateFrom } : {}),
                        ...(dateTo ? { lte: dateTo } : {}),
                      },
                    },
                    {
                      createdAt: {
                        ...(dateFrom ? { gte: dateFrom } : {}),
                        ...(dateTo ? { lte: dateTo } : {}),
                      },
                      paidAt: null,
                    },
                  ],
                }
              : {}),
            ...(status
              ? { mpStatus: status as "APPROVED" | "PENDING" | "REJECTED" | "REFUNDED" | "CANCELLED" | "IN_PROCESS" | "CHARGED_BACK" }
              : {}),
            ...(paymentType
              ? { type: paymentType as "ONE_TIME" | "MONTHLY" }
              : {}),
          },
          include: {
            enrollment: {
              include: {
                student: { select: { nome: true } },
                course: { select: { nome: true } },
              },
            },
          },
          orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
          take: 200,
        }),
        includePending
          ? prisma.enrollment.findMany({
              where: {
                tenantId: ctx.tenantId,
                status: "PENDING",
                // So as que ainda nao tem pagamento — evita duplicar uma linha
                // ja representada na tabela `payment`.
                payments: { none: {} },
                createdAt: { gte: dateFrom, lte: dateTo },
                ...(paymentType
                  ? { paymentType: paymentType as "ONE_TIME" | "MONTHLY" }
                  : {}),
              },
              include: {
                student: { select: { nome: true } },
                course: { select: { nome: true } },
              },
              orderBy: { createdAt: "desc" },
              take: 200,
            })
          : Promise.resolve([]),
      ])

    const monthRevenue = Number(monthApproved._sum.amount ?? 0)
    const received = Number(allTimeAgg._sum.amount ?? 0)
    const pending = Number(pendingAgg._sum.finalAmount ?? 0)
    const toReceive = Math.max(monthRevenue * 0.05, 0)

    const weekChart: { label: string; value: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const found = dailyRevenueRaw.find(
        (r) => new Date(r.day).toDateString() === day.toDateString(),
      )
      weekChart.push({
        label: day.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", ""),
        value: Number(found?.revenue ?? 0),
      })
    }

    const monthChart = weeklyRevenueRaw.map((row, i) => ({
      label: `Sem ${i + 1}`,
      value: Number(row.revenue),
    }))

    const paymentRows = payments.map((p) => ({
      id: p.id,
      date: (p.paidAt ?? p.createdAt).toISOString(),
      description: `${p.enrollment.student.nome} · ${p.enrollment.course.nome}`,
      amount: Number(p.amount),
      status: p.mpStatus as string,
      type: p.type as string,
    }))

    const pendingRows = pendingEnrollments.map((e) => ({
      id: `pending-${e.id}`,
      date: e.createdAt.toISOString(),
      description: `${e.student.nome} · ${e.course.nome}`,
      amount: Number(e.finalAmount),
      status: "PENDING",
      type: e.paymentType as string,
    }))

    const allRows = [...paymentRows, ...pendingRows].sort((a, b) =>
      a.date < b.date ? 1 : -1,
    )

    return NextResponse.json({
      data: {
        metrics: {
          monthRevenue,
          received,
          pending,
          toReceive,
        },
        charts: {
          week: weekChart,
          month: monthChart,
        },
        payments: allRows,
      },
    })
  },
)
