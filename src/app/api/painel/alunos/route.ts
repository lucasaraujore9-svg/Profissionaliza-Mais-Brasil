import { guardianRequirement, hasGuardian } from "@/lib/students/guardian"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { Prisma, SubscriptionStatus } from "@prisma/client"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "@/lib/students/display-status"

/** Assinatura que da acesso hoje (inclui a em atraso, ainda na carencia). */
const LIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["ACTIVE", "PAST_DUE"]

export const GET = withRequestContext(
  { action: "painel.alunos.list", route: "/api/painel/alunos" },
  async (request: Request) => {
    const guard = await requirePainel("alunos.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("q")?.trim()
    const statusFilter = searchParams.get("status")?.trim()
    const enrollmentFilter = searchParams.get("enrollment")?.trim()

    const validStatus = ["ATIVO", "INATIVO", "BLOQUEADO", "DEVEDOR", "FORMADO", "INTERESSADO"]

    // Filtro por situacao de matricula/pagamento. "Com curso"/"sem curso"
    // usam matriculas ativas/concluidas (mesma definicao de coursesCount).
    //
    // Assinante conta como "com curso": na assinatura a matricula so nasce
    // quando o aluno abre um curso, e ate la quem pagou sumia do filtro de
    // quem tem acesso.
    let enrollmentWhere: Prisma.StudentWhereInput = {}
    switch (enrollmentFilter) {
      case "com_curso":
        enrollmentWhere = {
          OR: [
            { enrollments: { some: { status: { in: ["ACTIVE", "COMPLETED"] } } } },
            { subscriptions: { some: { status: { in: LIVE_SUBSCRIPTION_STATUSES } } } },
          ],
        }
        break
      case "sem_curso":
        enrollmentWhere = {
          enrollments: { none: { status: { in: ["ACTIVE", "COMPLETED"] } } },
          subscriptions: { none: { status: { in: LIVE_SUBSCRIPTION_STATUSES } } },
        }
        break
      case "pagamento_pendente":
        enrollmentWhere = { enrollments: { some: { status: "PENDING" } } }
        break
      case "curso_finalizado":
        enrollmentWhere = { enrollments: { some: { status: "COMPLETED" } } }
        break
    }

    const [students, statsRaw, pendingCount] = await Promise.all([
      prisma.student.findMany({
        where: {
          tenantId: ctx.tenantId,
          // Escopo do papel: sem `alunos.viewAll`, só os alunos que a pessoa
          // originou (matrícula com soldByUserId dela). Vai em `AND` junto com
          // `enrollmentWhere` porque os dois usam a chave `enrollments` — num
          // spread, o filtro da tela sobrescreveria o escopo e vazaria a
          // unidade inteira.
          AND: [ctx.scope.alunos, enrollmentWhere],
          ...(search
            ? {
                OR: [
                  { nome: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  // So adiciona busca por CPF quando ha digitos, senao
                  // `contains: ""` casaria com todos os alunos com CPF.
                  ...(search.replace(/\D/g, "")
                    ? [{ cpf: { contains: search.replace(/\D/g, "") } }]
                    : []),
                ],
              }
            : {}),
          ...(statusFilter && validStatus.includes(statusFilter)
            ? { status: statusFilter as "ATIVO" | "INATIVO" | "BLOQUEADO" | "DEVEDOR" | "FORMADO" | "INTERESSADO" }
            : {}),
        },
        include: {
          // Status das matriculas para derivar o status exibido (pago x pendente).
          enrollments: { select: { status: true } },
          subscriptions: {
            where: { status: { in: LIVE_SUBSCRIPTION_STATUSES } },
            select: { plan: { select: { name: true } } },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.student.groupBy({
        by: ["status"],
        where: { tenantId: ctx.tenantId, ...ctx.scope.alunos },
        _count: { _all: true },
      }),
      // Alunos ainda ATIVO mas sem pagamento confirmado (so matricula pendente).
      // Esse subconjunto e contado como "Pendente", nao "Ativo", nas stats.
      prisma.student.count({
        where: {
          tenantId: ctx.tenantId,
          status: "ATIVO",
          enrollments: { none: { status: { in: ["ACTIVE", "COMPLETED"] } } },
          // Escopo do papel dentro do AND pelo mesmo motivo da listagem: a
          // chave `enrollments` já está ocupada acima.
          AND: [
            { enrollments: { some: { status: "PENDING" } } },
            ctx.scope.alunos,
          ],
        },
      }),
    ])

    const stats = {
      total: statsRaw.reduce((sum, row) => sum + row._count._all, 0),
      ATIVO: 0,
      PENDENTE: pendingCount,
      INATIVO: 0,
      BLOQUEADO: 0,
      DEVEDOR: 0,
      FORMADO: 0,
      INTERESSADO: 0,
    }
    for (const row of statsRaw) {
      stats[row.status] = row._count._all
    }
    // "Ativos" reais = ATIVO no banco menos os que estao apenas com pagamento
    // pendente (esses migram para o contador "Pendentes").
    stats.ATIVO = Math.max(0, stats.ATIVO - pendingCount)

    return NextResponse.json({
      data: {
        students: students.map((s) => {
          const counts = countEnrollmentStatuses(s.enrollments)
          return {
            id: s.id,
            nome: s.nome,
            email: s.email,
            cpf: s.cpf,
            fone: s.fone,
            status: deriveStudentDisplayStatus(s.status, counts),
            createdAt: s.createdAt.toISOString(),
            coursesCount: counts.paidEnrollments,
            // Plano da assinatura paga, quando houver — a tela mostra "Assinante"
            // em vez de "0 cursos" para quem pagou e ainda nao abriu curso.
            subscriptionPlan: s.subscriptions[0]?.plan.name ?? null,
            plataformaAlunoId: s.plataformaAlunoId,
            nascimento: s.nascimento
              ? s.nascimento.toISOString().slice(0, 10)
              : null,
            responsavel: s.responsavel,
            // A tela de venda precisa saber que falta responsável ANTES do
            // submit — a maior parte das vendas usa a busca, não o cadastro novo.
            guardianMissing:
              guardianRequirement(s.nascimento) === "REQUIRED" &&
              !hasGuardian(s),
          }
        }),
        stats,
      },
    })
  },
)
