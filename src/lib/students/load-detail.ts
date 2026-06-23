import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"
import type { StudentData } from "@/components/shared/student-management/types"
import {
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "@/lib/students/display-status"
import { buildEnrollmentCheckoutUrl } from "@/lib/students/checkout-link"

/**
 * Carrega o aluno completo + matriculas + pagamentos + notas + notificacoes
 * para a tela de gestao. Filtragem por tenant fica a cargo do caller
 * (admin pode ver qualquer um; painel filtra por tenantId).
 */
export async function loadStudentDetail(args: {
  studentId: string
  tenantId?: string | null
}): Promise<StudentData | null> {
  const where: { id: string; tenantId?: string } = { id: args.studentId }
  if (args.tenantId) {
    where.tenantId = args.tenantId
  }

  const student = await prisma.student.findFirst({
    where,
    include: {
      tenant: { select: { name: true, slug: true, customDomain: true } },
      enrollments: {
        orderBy: { createdAt: "desc" },
        include: {
          course: { select: { nome: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  })

  if (!student) return null

  const enrollmentIds = student.enrollments.map((e) => e.id)
  const [payments, notifications] = await Promise.all([
    prisma.payment.findMany({
      where: { enrollmentId: { in: enrollmentIds } },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      include: { enrollment: { include: { course: { select: { nome: true } } } } },
      take: 100,
    }),
    prisma.notification.findMany({
      where: { audience: "STUDENT", studentId: student.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ])

  // Senha da plataforma de aulas (EA): guardada criptografada (AES-256-GCM).
  // Descriptografamos para exibir na gestão. Valores legados em texto puro ou
  // corrompidos degradam para `null` (só o login é mostrado) em vez de quebrar.
  let plataformaSenha: string | null = null
  if (student.plataformaAlunoSenha) {
    try {
      plataformaSenha = decrypt(student.plataformaAlunoSenha)
    } catch (err) {
      contextLogger().warn(
        { err, event: "student.load_detail.decrypt_failed", studentId: student.id },
        "falha ao descriptografar senha da plataforma — exibindo só o login",
      )
    }
  }

  const totalPaid = payments.reduce(
    (sum, p) =>
      sum +
      (p.mpStatus === "APPROVED" || p.paidAt !== null ? Number(p.amount) : 0),
    0,
  )

  return {
    id: student.id,
    nome: student.nome,
    email: student.email,
    cpf: student.cpf,
    fone: student.fone,
    fone2: student.fone2,
    cidade: student.cidade,
    estado: student.estado,
    cep: student.cep,
    rua: student.rua,
    bairro: student.bairro,
    numero: student.numero,
    nascimento: student.nascimento?.toISOString() ?? null,
    // Status exibido derivado das matriculas: aluno ATIVO sem pagamento
    // confirmado (so matricula pendente) aparece como "PENDENTE".
    status: deriveStudentDisplayStatus(
      student.status,
      countEnrollmentStatuses(student.enrollments),
    ),
    apostila: student.apostila,
    plataformaAlunoId: student.plataformaAlunoId,
    plataformaSenha,
    asaasCustomerId: student.asaasCustomerId,
    tenantName: student.tenant.name,
    tenantSlug: student.tenant.slug,
    passwordSetAt: student.passwordSetAt?.toISOString() ?? null,
    lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
    createdAt: student.createdAt.toISOString(),
    totalPaid,
    enrollments: student.enrollments.map((e) => ({
      id: e.id,
      courseName: e.course.nome,
      status: e.status,
      paymentType: e.paymentType,
      gateway: e.gateway,
      finalAmount: Number(e.finalAmount),
      installmentsTotal: e.installmentsTotal,
      installmentsPaid: e.installmentsPaid,
      asaasInvoiceUrl: e.asaasInvoiceUrl,
      // Link para admin/revenda recuperarem o checkout de uma cobranca pendente
      // (venda direta aguardando pagamento ou carrinho abandonado).
      checkoutUrl: buildEnrollmentCheckoutUrl({
        status: e.status,
        enrollmentId: e.id,
        gateway: e.gateway,
        asaasInvoiceUrl: e.asaasInvoiceUrl,
        tenantSlug: student.tenant.slug,
        tenantCustomDomain: student.tenant.customDomain,
      }),
      startedAt: e.startedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.mpStatus,
      paidAt: p.paidAt?.toISOString() ?? null,
      courseName: p.enrollment.course.nome,
      createdAt: p.createdAt.toISOString(),
    })),
    notes: student.notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      authorName: n.author.name,
      authorId: n.author.id,
    })),
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      level: n.level,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    })),
  }
}
