import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePmbSales, requirePmbTeam } from "@/lib/auth/guards"
import { getOrCreatePmbTenant } from "@/lib/pmb-tenant"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { applyStudentEdit, editSchema } from "@/lib/students/management"

export const GET = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.get", route: "/api/admin/alunos/[id]" },
  async (_request: Request, ctx) => {
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
      plataformaAlunoId: true,
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
      plataformaAlunoId: student.plataformaAlunoId,
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
  },
)

/**
 * PATCH /api/admin/alunos/[id] — edita dados do aluno.
 * Acessivel a todo time PMB (SUPER_ADMIN, PMB_SALES, PMB_RESELLER_MGR).
 */
export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.alunos.update", route: "/api/admin/alunos/[id]" },
  async (request: Request, ctx) => {
    const guard = await requirePmbTeam()
    if (!guard.ok) return guard.response

    const { id } = await ctx.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = editSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", issues: parsed.error.flatten() },
        { status: 400 },
      )
    }

    // Admin PMB gerencia alunos de qualquer tenant (vide loadStudentDetail) —
    // sem escopo de tenantId aqui, por design. applyStudentEdit devolve false
    // se o id não existir.
    try {
      const updated = await applyStudentEdit(id, parsed.data)
      if (!updated) {
        return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
      }
    } catch (err) {
      // unique constraint (email/cpf por tenant)
      const msg = (err as Error).message ?? "Falha ao salvar"
      return NextResponse.json({ error: msg }, { status: 409 })
    }

    return NextResponse.json({ ok: true })
  },
)
