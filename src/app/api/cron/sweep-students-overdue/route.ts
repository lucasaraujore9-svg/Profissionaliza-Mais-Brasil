import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { addMonthsClamped } from "@/lib/dates"
import { get as redisGet, set as redisSet, invalidate as redisDel } from "@/lib/redis/cache"

export const maxDuration = 300
export const dynamic = "force-dynamic"

const STUDENT_GRACE_DAYS = 5

// PERF-005: cada candidato faz IO externo serial (bloqueio EA/LMS + notificação).
// Suspender NÃO remove a linha do filtro (a where inclui SUSPENDED), então um take
// simples starvaria a cauda. Usamos cursor keyset por `id` no Redis: cada execução
// varre um lote e avança o cursor; ao chegar ao fim, zera para recomeçar — assim
// TODOS os candidatos são cobertos ao longo de poucas execuções (bloqueio/aviso
// são idempotentes por status/wasActive, então re-varrer é inócuo). Fail-open:
// Redis off => cursor null => começa do início.
const OVERDUE_BATCH = 500
const CURSOR_KEY = "cron:sweep-students-overdue:cursor"

/**
 * Sweep diario para alunos individuais inadimplentes.
 *
 * Cenario: aluno comprou um curso MONTHLY (gateway ASAAS), pagou a 1a
 * mensalidade, mas nao pagou as seguintes. O webhook do Asaas dispara
 * PAYMENT_OVERDUE → o handler ja marca enrollment SUSPENDED. Este sweep
 * cobre o caso de webhook perdido OU casos onde precisamos de uma janela
 * de carencia maior antes de bloquear o acesso.
 *
 * Logica: para cada Enrollment ACTIVE com installmentsTotal e
 * installmentsPaid < installmentsTotal, conta dias desde o startedAt +
 * (installmentsPaid * 30). Se passou de STUDENT_GRACE_DAYS dias do
 * vencimento esperado, suspende o enrollment e bloqueia o aluno.
 *
 * IMPORTANTE: so bloqueia o aluno se ele NAO tiver outro Enrollment ACTIVE
 * em dia. Caso contrario, so suspende a matricula daquele curso e mantem
 * o acesso geral.
 */
async function processOverdueStudents() {
  const now = new Date()
  const result = {
    inspected: 0,
    enrollmentsSuspended: 0,
    studentsBlocked: 0,
    errors: [] as string[],
  }

  const cursor = (await redisGet(CURSOR_KEY)) || undefined

  const candidates = await prisma.enrollment.findMany({
    where: {
      // Inclui SUSPENDED: o webhook Asaas/MP marca SUSPENDED no OVERDUE mas NÃO
      // bloqueia na plataforma parceira (R8). Sem varrer SUSPENDED aqui, esses
      // alunos manteriam acesso na plataforma indefinidamente (a query antiga só
      // pegava ACTIVE). O período de carência continua respeitado via ageDays.
      status: { in: ["ACTIVE", "SUSPENDED"] },
      installmentsTotal: { not: null },
      OR: [
        { asaasSubscriptionId: { not: null } },
        { mpSubscriptionId: { not: null } },
      ],
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: OVERDUE_BATCH,
    include: {
      student: {
        select: {
          id: true,
          status: true,
          enrollments: {
            where: { status: "ACTIVE" },
            select: { id: true, installmentsTotal: true, installmentsPaid: true, startedAt: true },
          },
        },
      },
    },
  })

  result.inspected = candidates.length

  for (const enrollment of candidates) {
    if (!enrollment.startedAt || !enrollment.installmentsTotal) continue
    if (enrollment.installmentsPaid >= enrollment.installmentsTotal) continue

    // Vencimento esperado da proxima parcela: cada parcela paga corresponde
    // a um mes inteiro. Aluno com `installmentsPaid=1` (1a parcela paga ao
    // comprar) e `startedAt=Jan/1` tem proxima parcela em Fev/1 — entao o
    // offset e exatamente `installmentsPaid` meses a partir de `startedAt`.
    // Edge case: setMonth(getMonth()+1) em 31/jan vira 3/mar (Feb tem 28d) e
    // bloqueio fica atrasado. Clampamos para o último dia do mês alvo.
    const expectedNextDue = addMonthsClamped(
      enrollment.startedAt,
      enrollment.installmentsPaid,
    )
    const ageDays = Math.floor(
      (now.getTime() - expectedNextDue.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (ageDays < STUDENT_GRACE_DAYS) continue

    try {
      // Só transiciona/conta quando estava ACTIVE — já-suspensos (pelo webhook)
      // não re-disparam update nem notificação a cada execução.
      const wasActive = enrollment.status === "ACTIVE"
      if (wasActive) {
        await prisma.enrollment.update({
          where: { id: enrollment.id },
          data: { status: "SUSPENDED" },
        })
        result.enrollmentsSuspended += 1
      }

      // So bloqueia o aluno se nao houver outra matricula ATIVA em dia
      const stillActive = enrollment.student.enrollments.filter((e) => {
        if (e.id === enrollment.id) return false
        // Sem mensalidades = ONE_TIME, considera em dia
        if (e.installmentsTotal === null) return true
        if (e.installmentsPaid >= e.installmentsTotal) return true
        if (!e.startedAt) return true
        // Usa o mesmo clamp do cálculo principal — setMonth nativo faz overflow
        // (31/jan + 1 mês = 3/mar) e atrasaria o bloqueio em ~1 mês.
        const due = addMonthsClamped(e.startedAt, e.installmentsPaid)
        return now.getTime() < due.getTime() + STUDENT_GRACE_DAYS * 86400_000
      })

      if (stillActive.length === 0 && enrollment.student.status === "ATIVO") {
        // blockStudentInEA seta status=BLOQUEADO, então o guard acima impede
        // re-bloqueio nas execuções seguintes (idempotente na prática).
        await blockStudentInEA(enrollment.student.id)
        result.studentsBlocked += 1
      }

      // Notifica apenas na transição (evita spam diário aos já-suspensos).
      if (wasActive) {
        await createNotification({
          audience: "STUDENT",
          studentId: enrollment.student.id,
          level: "ERROR",
          title: "Mensalidade em atraso — acesso suspenso",
          body:
            stillActive.length === 0
              ? `Vencimento atrasado em ${ageDays} dia(s). Pague para liberar o acesso.`
              : `Vencimento atrasado em ${ageDays} dia(s). A matrícula deste curso foi suspensa.`,
          category: "payment",
          href: "/aluno/pagamentos",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`enrollment ${enrollment.id}: ${message}`)
    }
  }

  // Avança/zera o cursor keyset (best-effort). Lote cheio => continua; lote
  // parcial (fim da lista) => zera para recomeçar do início na próxima execução.
  if (candidates.length === OVERDUE_BATCH) {
    await redisSet(CURSOR_KEY, candidates[candidates.length - 1].id, 7 * 24 * 60 * 60)
  } else {
    await redisDel(CURSOR_KEY)
  }

  return result
}

export const POST = withRequestContext(
  { action: "cron.sweep_students_overdue", route: "/api/cron/sweep-students-overdue" },
  async (request: Request) => {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const log = contextLogger()
    const result = await processOverdueStudents()

    log.info(
      {
        event: "cron.sweep_students_overdue.done",
        inspected: result.inspected,
        enrollmentsSuspended: result.enrollmentsSuspended,
        studentsBlocked: result.studentsBlocked,
        errorCount: result.errors.length,
      },
      "cron sweep-students-overdue concluído",
    )

    if (result.errors.length > 0) {
      log.error(
        {
          event: "cron.sweep_students_overdue.partial",
          errorCount: result.errors.length,
          sampleErrors: result.errors.slice(0, 5),
        },
        "cron sweep-students-overdue: suspensões/bloqueios falharam parcialmente",
      )
      await createNotification({
        audience: "ROLE",
        roleTarget: "SUPER_ADMIN",
        level: "ERROR",
        title: "Cron sweep-students-overdue: falhas parciais",
        body: `${result.errors.length} operação(ões) falharam. Inadimplentes podem seguir com acesso.`,
        category: "cron",
        href: "/admin/alunos",
      }).catch(() => undefined)
    }

    return NextResponse.json({ data: result })
  },
)

export async function GET(request: Request) {
  return POST(request)
}
