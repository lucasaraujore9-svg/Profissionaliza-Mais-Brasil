import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbSales } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"

interface Ctx {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, ctx: Ctx) {
  const guard = await requirePmbSales()
  if (!guard.ok) return guard.response

  const { id } = await ctx.params

  const pmbTenant = await getOrCreatePmbTenant()

  const whereEnrollments =
    guard.session.role === "SUPER_ADMIN"
      ? { tenantId: null as null }
      : { tenantId: null as null, soldByUserId: guard.session.userId }

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
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  return NextResponse.json({
    data: {
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
        originalAmount: e.originalAmount,
        discountAmount: e.discountAmount,
        finalAmount: e.finalAmount,
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
    },
  })
}
