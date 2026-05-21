import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { unblockTenantStudents } from "@/lib/auto-block"
import { unblockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"

export const maxDuration = 60
export const dynamic = "force-dynamic"

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : header
  return bearer === secret
}

/**
 * Sweep para reativar tenants e alunos que voltaram a pagar mas o webhook
 * pode ter falhado. Garante consistencia.
 *
 * Tenants: SUSPENDED + tem TenantPayment recente (status RECEIVED ou
 * CONFIRMED nas ultimas 48h) + nenhum OVERDUE → volta para ACTIVE +
 * desbloqueia alunos.
 *
 * Alunos individuais: Enrollment SUSPENDED + Payment recente associado ao
 * mesmo asaasSubscriptionId → volta para ACTIVE + desbloqueia aluno (se
 * nao tem outras matriculas em atraso).
 */
async function processReactivations() {
  const now = new Date()
  const recent = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const result = {
    tenantsReactivated: 0,
    enrollmentsReactivated: 0,
    studentsUnblocked: 0,
    errors: [] as string[],
  }

  // Tenants suspensos com pagamento recente confirmado
  const tenants = await prisma.tenant.findMany({
    where: {
      status: "SUSPENDED",
      slug: { not: "__pmb__" },
      tenantPayments: {
        some: {
          status: { in: ["RECEIVED", "CONFIRMED"] },
          paidAt: { gte: recent },
        },
        none: { status: "OVERDUE" },
      },
    },
    select: { id: true, billingMode: true },
  })

  for (const tenant of tenants) {
    try {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: "ACTIVE" },
      })
      result.tenantsReactivated += 1
      const unblock = await unblockTenantStudents(tenant.id)
      result.studentsUnblocked += unblock.affectedStudents

      await createNotification({
        audience: "TENANT",
        tenantId: tenant.id,
        level: "SUCCESS",
        title: "Conta reativada",
        body: "Pagamento confirmado. Seus alunos foram desbloqueados.",
        category: "tenant-billing",
        href: "/painel/financeiro",
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`tenant ${tenant.id}: ${msg}`)
    }
  }

  // Enrollments suspensos com pagamento recente
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: "SUSPENDED",
      payments: {
        some: {
          mpStatus: "APPROVED",
          paidAt: { gte: recent },
        },
      },
    },
    select: {
      id: true,
      studentId: true,
      student: { select: { status: true } },
    },
  })

  for (const enrollment of enrollments) {
    try {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: "ACTIVE" },
      })
      result.enrollmentsReactivated += 1

      if (enrollment.student.status === "BLOQUEADO") {
        await unblockStudentInEA(enrollment.studentId)
        result.studentsUnblocked += 1
      }

      await createNotification({
        audience: "STUDENT",
        studentId: enrollment.studentId,
        level: "SUCCESS",
        title: "Acesso reativado",
        body: "Pagamento recebido. Sua matrícula foi reativada.",
        category: "payment",
        href: "/aluno/cursos",
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`enrollment ${enrollment.id}: ${msg}`)
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await processReactivations()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
