import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { unblockTenantStudents } from "@/lib/auto-block"
import { unblockStudentInEA } from "@/lib/students/plataforma-actions"
import { canReactivateUnderTenant } from "@/lib/students/reactivation-guard"
import { invalidateTenantCache } from "@/lib/tenant/cache-invalidation"
import { createNotification } from "@/lib/notifications"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

export const maxDuration = 300
export const dynamic = "force-dynamic"

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
      slug: { not: PMB_TENANT_SLUG },
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
      // PERF-001: invalida o cache p/ a vitrine voltar a vender na hora.
      await invalidateTenantCache(tenant.id)
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
      student: { select: { status: true, tenant: { select: { status: true } } } },
    },
  })

  for (const enrollment of enrollments) {
    try {
      // SAAS-002: não reativa aluno de tenant não-ACTIVE (revenda suspensa por
      // inadimplência bloqueia todos os alunos; o pagamento de um curso avulso
      // não fura esse bloqueio). A reativação acontece pelo branch de tenant
      // acima quando a revenda volta a ACTIVE.
      if (!canReactivateUnderTenant(enrollment.student.tenant?.status)) {
        continue
      }
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
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await processReactivations()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
