import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/ea-actions"

export const maxDuration = 60
export const dynamic = "force-dynamic"

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header
  return bearer === secret
}

const STUDENT_GRACE_DAYS = 5

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

  const candidates = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      gateway: "ASAAS",
      installmentsTotal: { not: null },
      asaasSubscriptionId: { not: null },
    },
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

    // Vencimento esperado da proxima parcela
    const expectedNextDue = new Date(enrollment.startedAt)
    expectedNextDue.setMonth(
      expectedNextDue.getMonth() + enrollment.installmentsPaid + 1,
    )
    const ageDays = Math.floor(
      (now.getTime() - expectedNextDue.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (ageDays < STUDENT_GRACE_DAYS) continue

    try {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: "SUSPENDED" },
      })
      result.enrollmentsSuspended += 1

      // So bloqueia o aluno se nao houver outra matricula ATIVA em dia
      const stillActive = enrollment.student.enrollments.filter((e) => {
        if (e.id === enrollment.id) return false
        // Sem mensalidades = ONE_TIME, considera em dia
        if (e.installmentsTotal === null) return true
        if (e.installmentsPaid >= e.installmentsTotal) return true
        if (!e.startedAt) return true
        const due = new Date(e.startedAt)
        due.setMonth(due.getMonth() + e.installmentsPaid + 1)
        return now.getTime() < due.getTime() + STUDENT_GRACE_DAYS * 86400_000
      })

      if (stillActive.length === 0 && enrollment.student.status === "ATIVO") {
        await blockStudentInEA(enrollment.student.id)
        result.studentsBlocked += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`enrollment ${enrollment.id}: ${message}`)
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await processOverdueStudents()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
