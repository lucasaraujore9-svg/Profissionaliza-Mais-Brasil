import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { Badge } from "@/components/ui/badge"
import { StudentManagementClient } from "@/components/admin/student-management-client"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

function studentStatusBadgeVariant(status: string): "default" | "outline" | "secondary" | "destructive" {
  if (status === "ATIVO") return "default"
  if (status === "BLOQUEADO") return "destructive"
  return "outline"
}

export default async function StudentDetailPage({ params }: PageProps) {
  const session = await requireAdminSession()
  if (!session) redirect("/login?callbackUrl=/admin/vendas/alunos")
  if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_SALES") {
    redirect("/admin")
  }

  const { id } = await params

  const pmbTenant = await getOrCreatePmbTenant()

  const whereEnrollments =
    session.role === "SUPER_ADMIN"
      ? { tenantId: null as null }
      : { tenantId: null as null, soldByUserId: session.userId }

  const student = await prisma.student.findFirst({
    where: {
      id,
      tenantId: pmbTenant.id,
    },
    select: {
      id: true,
      nome: true,
      email: true,
      cpf: true,
      fone: true,
      status: true,
      apostila: true,
      eaAlunoId: true,
      asaasCustomerId: true,
      createdAt: true,
      enrollments: {
        where: whereEnrollments,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          courseId: true,
          course: { select: { nome: true } },
          status: true,
          paymentType: true,
          gateway: true,
          originalAmount: true,
          discountAmount: true,
          finalAmount: true,
          installmentsTotal: true,
          installmentsPaid: true,
          asaasPaymentId: true,
          asaasSubscriptionId: true,
          asaasInvoiceUrl: true,
          mpPreferenceId: true,
          mpSubscriptionId: true,
          externalReference: true,
          startedAt: true,
          expiresAt: true,
          createdAt: true,
        },
      },
    },
  })

  if (!student) {
    notFound()
  }

  const studentData = {
    id: student.id,
    nome: student.nome,
    email: student.email,
    cpf: student.cpf,
    fone: student.fone,
    status: student.status,
    apostila: student.apostila,
    eaAlunoId: student.eaAlunoId,
    asaasCustomerId: student.asaasCustomerId,
    createdAt: student.createdAt.toISOString(),
    enrollments: student.enrollments.map((e) => ({
      id: e.id,
      courseId: e.courseId,
      courseName: e.course.nome,
      status: e.status,
      paymentType: e.paymentType,
      gateway: e.gateway,
      originalAmount: Number(e.originalAmount),
      discountAmount: Number(e.discountAmount),
      finalAmount: Number(e.finalAmount),
      installmentsTotal: e.installmentsTotal,
      installmentsPaid: e.installmentsPaid,
      asaasPaymentId: e.asaasPaymentId,
      asaasSubscriptionId: e.asaasSubscriptionId,
      asaasInvoiceUrl: e.asaasInvoiceUrl,
      mpPreferenceId: e.mpPreferenceId,
      mpSubscriptionId: e.mpSubscriptionId,
      externalReference: e.externalReference,
      startedAt: e.startedAt?.toISOString() ?? null,
      expiresAt: e.expiresAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
  }

  return (
    <div className="p-8 space-y-6">
      {/* Back link */}
      <Link
        href="/admin/vendas/alunos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-[var(--color-pmb-green-900)]"
      >
        <ChevronLeft className="h-4 w-4" />
        Alunos
      </Link>

      {/* Title row */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-display text-[var(--color-pmb-green-900)]">
          {student.nome}
        </h1>
        <Badge variant={studentStatusBadgeVariant(student.status)}>
          {student.status}
        </Badge>
      </div>

      <StudentManagementClient student={studentData} role={session.role} />
    </div>
  )
}
