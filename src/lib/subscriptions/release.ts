import { prisma } from "@/lib/prisma"
import {
  advisoryLockKeyFrom,
  withAdvisoryLock,
  provisionCourseForStudent,
  type TenantContext,
} from "@/lib/enrollment/fulfill"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"
import { subscriptionGrantsAccess } from "./access"
import { planIncludesCourse } from "./plans"

/**
 * Liberacao SOB DEMANDA de um curso para quem assina.
 *
 * Por que sob demanda e nao tudo na contratacao: um plano "catalogo inteiro"
 * cobre 100+ cursos. A EA ate vincula todos numa chamada (`vinculocurso` sem
 * `idcurso`), mas o LMS matricula UM curso por vez — seriam 100+ chamadas por
 * assinante, e o painel do aluno abriria com uma lista que ele nunca pediu.
 * Aqui a matricula nasce quando ele abre o curso pela primeira vez.
 *
 * O resultado e um `Enrollment` COMUM. E essa a decisao central do desenho: SSO,
 * sincronizacao de progresso, `/aluno/cursos` e emissao de certificado passam a
 * funcionar sem uma linha nova, porque todos eles ja leem matricula.
 */

export type ReleaseFailure =
  | "SUBSCRIPTION_INACTIVE"
  | "COURSE_NOT_IN_PLAN"
  | "COURSE_UNAVAILABLE"
  | "BUSY"

export type ReleaseResult =
  | { ok: true; enrollmentId: string; created: boolean }
  | { ok: false; reason: ReleaseFailure }

/** Contexto de fornecedora, no mesmo formato que o fulfill usa. */
async function tenantContextFor(tenantId: string | null): Promise<TenantContext> {
  if (tenantId === null) {
    return {
      id: "__pmb__",
      slug: pmbPlataformaPolo(),
      plataformaVendedorId: pmbPlataformaVendedorId(),
      isPmbVitrine: true,
    }
  }
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, plataformaVendedorId: true },
  })
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    plataformaVendedorId: tenant.plataformaVendedorId,
  }
}

/**
 * Libera `courseId` para o assinante. Idempotente: chamada duas vezes devolve a
 * mesma matricula.
 */
export async function releaseSubscriptionCourse(
  subscriptionId: string,
  courseId: string,
): Promise<ReleaseResult> {
  const sub = await prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      studentId: true,
      tenantId: true,
      status: true,
      currentPeriodEnd: true,
      interval: true,
      plan: {
        select: {
          scope: true,
          categoryIds: true,
          courseIds: true,
          packageId: true,
        },
      },
      student: { select: { id: true, nome: true, email: true } },
    },
  })

  if (!sub || !subscriptionGrantsAccess(sub)) {
    return { ok: false, reason: "SUBSCRIPTION_INACTIVE" }
  }

  // O escopo e conferido AGORA, contra o catalogo de agora — e o que faz curso
  // novo de uma categoria assinada valer sem editar o plano. Tambem e o que
  // fecha a porta quando o curso sai do plano depois da contratacao.
  const included = await planIncludesCourse(sub.plan, sub.tenantId, courseId)
  if (!included) return { ok: false, reason: "COURSE_NOT_IN_PLAN" }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, nome: true, provider: true, lmsCourseId: true },
  })
  if (!course) return { ok: false, reason: "COURSE_UNAVAILABLE" }

  // Serializa por (aluno, curso): duplo clique em "Começar" ou retry do cliente
  // provisionariam o aluno DUAS vezes na fornecedora. Mesmo mecanismo do fulfill
  // — chave diferente, mas o mesmo espaço de advisory lock.
  let result: ReleaseResult = { ok: false, reason: "BUSY" }

  const ran = await withAdvisoryLock(
    advisoryLockKeyFrom(`SUBSCRIPTION_RELEASE:${sub.studentId}:${courseId}`),
    async () => {
      // Já tem matrícula deste curso? Reusa — inclusive a de uma compra avulsa
      // anterior. Criar uma segunda daria dois cards do mesmo curso ao aluno e
      // duplicaria a matrícula na fornecedora.
      const existing = await prisma.enrollment.findFirst({
        where: { studentId: sub.studentId, courseId },
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
      })

      // Matrícula ATIVA já vale — nada a fazer na fornecedora.
      if (existing && (existing.status === "ACTIVE" || existing.status === "COMPLETED")) {
        result = { ok: true, enrollmentId: existing.id, created: false }
        return
      }

      const tenantCtx = await tenantContextFor(sub.tenantId)

      // Uma matrícula CANCELADA teve o curso REVOGADO na fornecedora (é o que o
      // cancelamento da assinatura faz). Reativar só o status local devolveria
      // um card "Continuar" que abre um curso onde o aluno não está mais
      // matriculado. Por isso reprovisiona antes de reativar — e a chave de
      // idempotência muda a cada religação, senão o LMS devolveria a matrícula
      // revogada em vez de criar uma nova.
      const provisioned = await provisionCourseForStudent(
        tenantCtx,
        { id: sub.student.id, nome: sub.student.nome, email: sub.student.email },
        course,
        existing
          ? `sub:${sub.id}:${courseId}:reactivate:${existing.id}`
          : `sub:${sub.id}:${courseId}`,
      )

      if (existing) {
        await prisma.enrollment.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            studentSubscriptionId: sub.id,
            cancelledAt: null,
            lmsEnrollmentId: provisioned.lmsEnrollmentId,
            lmsOrigin: provisioned.lmsOrigin,
            lmsPlayback: provisioned.lmsPlayback,
            lmsLogin: provisioned.lmsLogin,
            lmsSenha: provisioned.lmsSenha,
            lmsPortalUrl: provisioned.lmsPortalUrl,
          },
        })
        contextLogger().info(
          {
            event: "subscription.course_reactivated",
            subscriptionId: sub.id,
            courseId,
          },
          "curso religado por assinatura",
        )
        result = { ok: true, enrollmentId: existing.id, created: false }
        return
      }

      const enrollment = await prisma.enrollment.create({
        data: {
          tenantId: sub.tenantId,
          studentId: sub.studentId,
          courseId,
          studentSubscriptionId: sub.id,
          // Sem dinheiro próprio: quem carrega a receita é o SubscriptionPayment
          // do ciclo. Um Payment aqui contaria a mesma mensalidade N vezes, uma
          // por curso aberto.
          paymentType: "ONE_TIME",
          status: "ACTIVE",
          originalAmount: 0,
          discountAmount: 0,
          finalAmount: 0,
          startedAt: new Date(),
          // NULL de propósito: o prazo é o da assinatura, não os 12 meses de
          // STUDENT_ACCESS_MONTHS. O sweep de expiração só olha prazo não-nulo.
          expiresAt: null,
          lmsEnrollmentId: provisioned.lmsEnrollmentId,
          lmsOrigin: provisioned.lmsOrigin,
          lmsPlayback: provisioned.lmsPlayback,
          lmsLogin: provisioned.lmsLogin,
          lmsSenha: provisioned.lmsSenha,
          lmsPortalUrl: provisioned.lmsPortalUrl,
        },
        select: { id: true },
      })

      contextLogger().info(
        {
          event: "subscription.course_released",
          subscriptionId: sub.id,
          studentId: sub.studentId,
          courseId,
          provider: course.provider,
        },
        "curso liberado por assinatura",
      )

      result = { ok: true, enrollmentId: enrollment.id, created: true }
    },
  )

  if (!ran) return { ok: false, reason: "BUSY" }
  return result
}
