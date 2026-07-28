import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"
import { normalizeLmsPublicUrl } from "@/lib/lms/urls"
import type { StudentData } from "@/components/shared/student-management/types"
import {
  deriveStudentDisplayStatus,
  countEnrollmentStatuses,
} from "@/lib/students/display-status"
import { buildEnrollmentCheckoutUrl } from "@/lib/students/checkout-link"
import {
  computeAllowedPercent,
  isPaceGatedPlan,
} from "@/lib/enrollment/pace-gate"
import { resolvePaceGateSettings } from "@/lib/enrollment/pace-settings"

/**
 * Carrega o aluno completo + matriculas + pagamentos + notas + notificacoes
 * para a tela de gestao. Filtragem por tenant fica a cargo do caller
 * (admin pode ver qualquer um; painel filtra por tenantId).
 */
export async function loadStudentDetail(args: {
  studentId: string
  tenantId?: string | null
  /**
   * Filtro extra de escopo do papel (ver `PainelContext.scope.alunos`). Sem
   * ele, um vendedor abriria pelo ID direto um aluno que não é da carteira
   * dele — a lista já vem escopada, mas a URL não.
   */
  scope?: Prisma.StudentWhereInput
}): Promise<StudentData | null> {
  const where: Prisma.StudentWhereInput = { id: args.studentId, ...args.scope }
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
          coursePackage: {
            select: {
              name: true,
              _count: { select: { items: true } },
            },
          },
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
      include: {
        enrollment: {
          include: {
            course: { select: { nome: true } },
            coursePackage: { select: { name: true } },
          },
        },
      },
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

  // Credenciais do LMS por curso (proprio do LMS ou parceiro). Guardadas por
  // matricula porque origin/playback variam por curso. Senha CIFRADA — decifrada
  // aqui, degradando a `null` se corrompida (mesma politica do plataformaSenha).
  // Lidas das matriculas ja escopadas pelo `student` (isolamento por tenant).
  const lmsCredentials = student.enrollments
    .filter((e) => e.lmsLogin)
    .map((e) => {
      let senha: string | null = null
      if (e.lmsSenha) {
        try {
          senha = decrypt(e.lmsSenha)
        } catch (err) {
          contextLogger().warn(
            {
              err,
              event: "student.load_detail.lms_decrypt_failed",
              studentId: student.id,
              enrollmentId: e.id,
            },
            "falha ao descriptografar senha do LMS — exibindo só o login",
          )
        }
      }
      return {
        enrollmentId: e.id,
        courseName: e.course.nome,
        origin: e.lmsOrigin,
        playback: e.lmsPlayback,
        login: e.lmsLogin as string,
        senha,
        portalUrl: normalizeLmsPublicUrl(e.lmsPortalUrl),
      }
    })

  const totalPaid = payments.reduce(
    (sum, p) =>
      sum +
      (p.mpStatus === "APPROVED" || p.paidAt !== null ? Number(p.amount) : 0),
    0,
  )

  // A cota vale para esta unidade? Sem isso a tela mostraria uma cota que não
  // está sendo aplicada — pior que não mostrar nada.
  const { enabled: paceGateEnabled } = await resolvePaceGateSettings(student.tenantId)

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
    paceGateEnabled,
    enrollments: student.enrollments.map((e) => ({
      id: e.id,
      courseName: e.course.nome,
      packageName: e.coursePackage?.name ?? null,
      packageCourseCount: e.coursePackage?._count.items ?? null,
      packagePrimary: e.packagePrimary,
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
      // Cota de aulas: calculada aqui com a MESMA função do motor, para a tela
      // nunca discordar do que está de fato aplicado na plataforma.
      progressPercent: e.progressPercent ?? 0,
      paceAllowedPercent: isPaceGatedPlan(e) ? computeAllowedPercent(e) : null,
      paceBlocked: e.paceBlockedAt !== null,
      paceExemptAt: e.paceExemptAt?.toISOString() ?? null,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      status: p.mpStatus,
      paidAt: p.paidAt?.toISOString() ?? null,
      courseName:
        p.enrollment.packagePrimary && p.enrollment.coursePackage
          ? p.enrollment.coursePackage.name
          : p.enrollment.course.nome,
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
    lmsCredentials,
  }
}
