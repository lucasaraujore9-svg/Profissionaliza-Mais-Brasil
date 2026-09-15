import type { CourseProvider, EnrollmentStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import {
  advisoryLockKeyFrom,
  withAdvisoryLock,
  provisionCourseForStudent,
  type TenantContext,
} from "@/lib/enrollment/fulfill"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { checkEaCourseStarted } from "@/lib/students/progress"
import { pmbPlataformaPolo, pmbPlataformaVendedorId } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"
import { subscriptionGrantsAccess } from "./access"
import { planIncludesCourse } from "./plans"
import {
  SUBSCRIPTION_MAX_ACTIVE_COURSES,
  canReleaseSubscriptionSlot,
  occupiesSubscriptionSlot,
  slotOccupyingWhere,
  slotReleaseKeepsProgress,
} from "./slots"

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
 *
 * VAGAS: o assinante tem no maximo `SUBSCRIPTION_MAX_ACTIVE_COURSES` cursos em
 * andamento. Com a lista cheia, abrir outro exige tirar um — o que pode vir no
 * mesmo pedido (`replaceCourseId`). Ver `slots.ts`.
 */

export type ReleaseFailure =
  | "SUBSCRIPTION_INACTIVE"
  | "COURSE_NOT_IN_PLAN"
  | "COURSE_UNAVAILABLE"
  | "BUSY"
  /** A lista esta cheia e o pedido nao disse qual curso sai. */
  | "SLOTS_FULL"
  /** O curso a tirar nao esta na lista desta assinatura, ou nao pode sair. */
  | "SLOT_NOT_RELEASABLE"
  /** A plataforma de aulas recusou/falhou ao revogar ou matricular. */
  | "PROVIDER_FAILED"

export type ReleaseResult =
  | { ok: true; enrollmentId: string; created: boolean }
  | { ok: false; reason: ReleaseFailure }

export interface ReleaseOptions {
  /**
   * Curso a tirar da lista para abrir este, quando ela estiver cheia. Com vaga
   * livre ele e IGNORADO: tirar um curso sem necessidade so faria o aluno
   * perder da lista algo que ele nao precisava perder.
   */
  replaceCourseId?: string
}

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
 * Serializa TUDO que mexe nas vagas de uma assinatura. A chave e da assinatura,
 * e nao de (aluno, curso): dois cliques em cursos DIFERENTES com a lista em 9
 * leriam "9 ocupadas" ao mesmo tempo e o aluno terminaria com 11.
 */
function slotLockKey(subscriptionId: string): bigint {
  return advisoryLockKeyFrom(`SUBSCRIPTION_RELEASE:${subscriptionId}`)
}

const SUB_SELECT = {
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
} as const

interface CourseRef {
  id: string
  nome: string
  provider: CourseProvider
  lmsCourseId: string | null
}

interface ExistingEnrollment {
  id: string
  status: EnrollmentStatus
  progressStatus: string | null
  studentSubscriptionId: string | null
  cancelledAt: Date | null
  subscriptionSlotReleasedAt: Date | null
}

const EXISTING_SELECT = {
  id: true,
  status: true,
  progressStatus: true,
  studentSubscriptionId: true,
  cancelledAt: true,
  subscriptionSlotReleasedAt: true,
} as const

type LoadedSub = NonNullable<
  Awaited<ReturnType<typeof loadSubscription>>
>

function loadSubscription(subscriptionId: string) {
  return prisma.studentSubscription.findUnique({
    where: { id: subscriptionId },
    select: SUB_SELECT,
  })
}

/**
 * Provisiona na fornecedora e grava a matricula como ATIVA desta assinatura —
 * criando a linha ou religando uma existente.
 */
async function activateCourse(
  sub: LoadedSub,
  course: CourseRef,
  existing: ExistingEnrollment | null,
): Promise<{ enrollmentId: string; created: boolean }> {
  const tenantCtx = await tenantContextFor(sub.tenantId)

  // Uma matrícula CANCELADA teve o curso REVOGADO na fornecedora (é o que o
  // cancelamento da assinatura e o "tirar da lista" fazem). Reativar só o status
  // local devolveria um card "Continuar" que abre um curso onde o aluno não está
  // mais matriculado. Por isso reprovisiona antes de reativar — e a chave de
  // idempotência muda a CADA religação (o instante em que saiu entra nela): um
  // curso que vai e volta da lista várias vezes não pode reusar a resposta da
  // primeira volta.
  const leftAt = existing?.subscriptionSlotReleasedAt ?? existing?.cancelledAt ?? null
  const provisioned = await provisionCourseForStudent(
    tenantCtx,
    { id: sub.student.id, nome: sub.student.nome, email: sub.student.email },
    course,
    existing
      ? `sub:${sub.id}:${course.id}:reactivate:${existing.id}:${leftAt?.getTime() ?? 0}`
      : `sub:${sub.id}:${course.id}`,
  )

  if (existing) {
    await prisma.enrollment.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        studentSubscriptionId: sub.id,
        cancelledAt: null,
        subscriptionSlotReleasedAt: null,
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
        event: existing.subscriptionSlotReleasedAt
          ? "subscription.course_resumed"
          : "subscription.course_reactivated",
        subscriptionId: sub.id,
        courseId: course.id,
      },
      "curso religado por assinatura",
    )
    return { enrollmentId: existing.id, created: false }
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: sub.tenantId,
      studentId: sub.studentId,
      courseId: course.id,
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
      courseId: course.id,
      provider: course.provider,
    },
    "curso liberado por assinatura",
  )

  return { enrollmentId: enrollment.id, created: true }
}

/**
 * Tira um curso da lista: revoga na plataforma de aulas e marca a matricula.
 *
 * A revogacao vem ANTES da escrita local, e a falha dela propaga: marcar a vaga
 * como livre com o curso ainda aberto la seria exatamente o 11o curso que a
 * regra existe para impedir.
 */
async function releaseSlot(
  sub: LoadedSub,
  enrollment: { id: string; courseId: string },
): Promise<void> {
  await unlinkCourseFromStudent(sub.studentId, enrollment.courseId)
  const now = new Date()
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "CANCELLED",
      cancelledAt: now,
      subscriptionSlotReleasedAt: now,
    },
  })
  contextLogger().info(
    {
      event: "subscription.course_slot_released",
      subscriptionId: sub.id,
      studentId: sub.studentId,
      courseId: enrollment.courseId,
      enrollmentId: enrollment.id,
    },
    "curso tirado da lista da assinatura",
  )
}

/**
 * A matricula desta assinatura para o curso, se ela puder sair da lista.
 *
 * Curso da plataforma LEGADA passa por duas conferencias: a copia local
 * (`canReleaseSubscriptionSlot`) e, so se ela deixar, o progresso AO VIVO na
 * plataforma. La desvincular APAGA o progresso e nao ha webhook — o banco pode
 * dizer 0% de um aluno que assistiu aulas ontem. Qualquer duvida (plataforma
 * fora, curso nao achado na lista dela) e recusa: o custo de recusar e o aluno
 * esperar concluir; o de errar e apagar o que ele estudou.
 */
async function findReleasable(
  sub: LoadedSub,
  courseId: string,
): Promise<{ id: string; courseId: string } | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId: sub.studentId, courseId, studentSubscriptionId: sub.id },
    select: {
      id: true,
      courseId: true,
      status: true,
      progressStatus: true,
      progressPercent: true,
      course: { select: { provider: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  if (!enrollment) return null
  const releasable = canReleaseSubscriptionSlot({
    status: enrollment.status,
    progressStatus: enrollment.progressStatus,
    progressPercent: enrollment.progressPercent,
    provider: enrollment.course.provider,
  })
  if (!releasable) return null

  if (!slotReleaseKeepsProgress(enrollment.course.provider)) {
    const live = await checkEaCourseStarted(enrollment.id)
    if (live !== "not_started") {
      contextLogger().info(
        {
          event: "subscription.slot_release_refused_started",
          subscriptionId: sub.id,
          courseId,
          live,
        },
        "curso da plataforma legada nao saiu da lista: aluno ja comecou ou nao deu para conferir",
      )
      return null
    }
  }

  return { id: enrollment.id, courseId: enrollment.courseId }
}

/**
 * Libera `courseId` para o assinante. Idempotente: chamada duas vezes devolve a
 * mesma matricula.
 */
export async function releaseSubscriptionCourse(
  subscriptionId: string,
  courseId: string,
  opts: ReleaseOptions = {},
): Promise<ReleaseResult> {
  const sub = await loadSubscription(subscriptionId)

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

  let result: ReleaseResult = { ok: false, reason: "BUSY" }

  const ran = await withAdvisoryLock(slotLockKey(sub.id), async () => {
    // Já tem matrícula deste curso? Reusa — inclusive a de uma compra avulsa
    // anterior. Criar uma segunda daria dois cards do mesmo curso ao aluno e
    // duplicaria a matrícula na fornecedora.
    const existing: ExistingEnrollment | null = await prisma.enrollment.findFirst({
      where: { studentId: sub.studentId, courseId },
      select: EXISTING_SELECT,
      orderBy: { createdAt: "desc" },
    })

    // Matrícula ATIVA já vale — nada a fazer na fornecedora, e nenhuma vaga
    // nova é ocupada (compra avulsa não conta; a da assinatura já está contada).
    if (existing && (existing.status === "ACTIVE" || existing.status === "COMPLETED")) {
      result = { ok: true, enrollmentId: existing.id, created: false }
      return
    }

    // Esta liberação ocupa uma vaga NOVA? A matrícula volta ATIVA com o
    // progresso que tinha — um curso concluído que sai e volta da lista continua
    // concluído e não pesa. E a que já ocupa vaga desta assinatura (suspensa,
    // pendente) não conta duas vezes.
    const alreadyCounted =
      existing !== null &&
      existing.studentSubscriptionId === sub.id &&
      occupiesSubscriptionSlot(existing)
    const takesSlot =
      !alreadyCounted &&
      occupiesSubscriptionSlot({
        status: "ACTIVE",
        progressStatus: existing?.progressStatus ?? null,
      })

    let released: { id: string; courseId: string } | null = null

    if (takesSlot) {
      const used = await prisma.enrollment.count({ where: slotOccupyingWhere(sub.id) })
      if (used >= SUBSCRIPTION_MAX_ACTIVE_COURSES) {
        if (!opts.replaceCourseId || opts.replaceCourseId === courseId) {
          result = { ok: false, reason: "SLOTS_FULL" }
          return
        }
        const toRelease = await findReleasable(sub, opts.replaceCourseId)
        if (!toRelease) {
          result = { ok: false, reason: "SLOT_NOT_RELEASABLE" }
          return
        }
        // Uma troca abre UMA vaga. Numa base acima do teto (improvável, mas a
        // regra chegou depois dos assinantes) tirar um curso não basta — e
        // tirá-lo sem conseguir abrir o outro só faria o aluno perder um curso.
        if (used - 1 >= SUBSCRIPTION_MAX_ACTIVE_COURSES) {
          result = { ok: false, reason: "SLOTS_FULL" }
          return
        }
        try {
          await releaseSlot(sub, toRelease)
        } catch (err) {
          logProviderFailure(err, "subscription.swap_release_failed", sub.id, toRelease.courseId)
          result = { ok: false, reason: "PROVIDER_FAILED" }
          return
        }
        released = toRelease
      }
    }

    try {
      result = { ok: true, ...(await activateCourse(sub, course, existing)) }
    } catch (err) {
      logProviderFailure(err, "subscription.course_release_failed", sub.id, course.id)
      // A troca tirou um curso e o novo não abriu. Devolve o que saiu: o aluno
      // pediu para TROCAR, não para perder um curso. Se a devolução também
      // falhar, ele ainda consegue retomar pela lista — nada se perdeu: na
      // plataforma própria o progresso está salvo, e da legada só sai curso
      // que ele nem tinha começado.
      if (released) await restoreReleased(sub, released.courseId)
      result = { ok: false, reason: "PROVIDER_FAILED" }
    }
  })

  if (!ran) return { ok: false, reason: "BUSY" }
  return result
}

function logProviderFailure(
  err: unknown,
  event: string,
  subscriptionId: string,
  courseId: string,
): void {
  contextLogger().error(
    { err, event, subscriptionId, courseId },
    "plataforma de aulas falhou ao alterar a lista da assinatura",
  )
}

/** Compensação da troca que não completou. Nunca lança. */
async function restoreReleased(sub: LoadedSub, courseId: string): Promise<void> {
  try {
    const [course, existing] = await Promise.all([
      prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { id: true, nome: true, provider: true, lmsCourseId: true },
      }),
      prisma.enrollment.findFirstOrThrow({
        where: { studentId: sub.studentId, courseId, studentSubscriptionId: sub.id },
        select: EXISTING_SELECT,
        orderBy: { createdAt: "desc" },
      }),
    ])
    await activateCourse(sub, course, existing)
  } catch (err) {
    contextLogger().error(
      { err, event: "subscription.swap_restore_failed", subscriptionId: sub.id, courseId },
      "troca de curso falhou e o curso tirado da lista nao voltou — aluno pode retomar",
    )
  }
}

export type ReleaseSlotResult =
  | { ok: true }
  | {
      ok: false
      reason: "SUBSCRIPTION_INACTIVE" | "SLOT_NOT_RELEASABLE" | "BUSY" | "PROVIDER_FAILED"
    }

/**
 * "Tirar da lista": libera a vaga do curso sem abrir outro no lugar.
 *
 * Na plataforma própria o progresso fica guardado e "Retomar" no catálogo do
 * plano religa a matrícula de onde parou (`releaseSubscriptionCourse`). Da
 * legada só sai curso ainda não começado — ver `findReleasable`.
 */
export async function releaseSubscriptionSlot(
  subscriptionId: string,
  courseId: string,
): Promise<ReleaseSlotResult> {
  const sub = await loadSubscription(subscriptionId)
  if (!sub || !subscriptionGrantsAccess(sub)) {
    return { ok: false, reason: "SUBSCRIPTION_INACTIVE" }
  }

  let result: ReleaseSlotResult = { ok: false, reason: "BUSY" }
  const ran = await withAdvisoryLock(slotLockKey(sub.id), async () => {
    const toRelease = await findReleasable(sub, courseId)
    if (!toRelease) {
      result = { ok: false, reason: "SLOT_NOT_RELEASABLE" }
      return
    }
    try {
      await releaseSlot(sub, toRelease)
      result = { ok: true }
    } catch (err) {
      logProviderFailure(err, "subscription.slot_release_failed", sub.id, courseId)
      result = { ok: false, reason: "PROVIDER_FAILED" }
    }
  })

  if (!ran) return { ok: false, reason: "BUSY" }
  return result
}

/** Matricula de uma assinatura ENCERRADA que pode migrar para a viva. */
export interface AdoptableEnrollment {
  id: string
  courseId: string
  status: EnrollmentStatus
  progressStatus: string | null
}

/**
 * O aluno cancelou e voltou a assinar antes do fim do periodo pago: os cursos
 * que a assinatura ANTIGA abriu passam para a NOVA, em vez de serem cortados
 * quando o periodo antigo acabar — com a assinatura nova valendo, cortar
 * apagaria o progresso na plataforma legada sem motivo nenhum.
 *
 * Mas so o que a nova de fato cobre: curso fora do plano novo, ou que nao cabe
 * nas vagas dele, fica de fora e e cortado pelo chamador. Migrar tudo sem olhar
 * seria o atalho para ter 20 cursos abertos (10 da antiga + 10 da nova).
 *
 * Roda sob o lock de vagas da assinatura NOVA. Devolve null quando o lock esta
 * ocupado: o chamador NAO corta nada nessa passada e tenta de novo na proxima —
 * cortar sem ter olhado a assinatura viva e o erro caro.
 */
export async function adoptIntoLiveSubscription(
  liveSubscriptionId: string,
  enrollments: AdoptableEnrollment[],
): Promise<{ adopted: string[] } | null> {
  const sub = await loadSubscription(liveSubscriptionId)
  if (!sub || !subscriptionGrantsAccess(sub)) return { adopted: [] }

  let adopted: string[] = []
  const ran = await withAdvisoryLock(slotLockKey(sub.id), async () => {
    let used = await prisma.enrollment.count({ where: slotOccupyingWhere(sub.id) })
    const ids: string[] = []
    // Concluidos primeiro: nao ocupam vaga, entao nunca disputam lugar com um
    // curso em andamento.
    const ordered = [...enrollments].sort(
      (a, b) => Number(occupiesSubscriptionSlot(a)) - Number(occupiesSubscriptionSlot(b)),
    )
    for (const e of ordered) {
      if (!(await planIncludesCourse(sub.plan, sub.tenantId, e.courseId))) continue
      const takesSlot = occupiesSubscriptionSlot(e)
      if (takesSlot && used >= SUBSCRIPTION_MAX_ACTIVE_COURSES) continue
      await prisma.enrollment.update({
        where: { id: e.id },
        data: { studentSubscriptionId: sub.id },
      })
      if (takesSlot) used += 1
      ids.push(e.id)
    }
    adopted = ids
  })

  if (!ran) return null
  if (adopted.length > 0) {
    contextLogger().info(
      { event: "subscription.enrollments_adopted", subscriptionId: sub.id, count: adopted.length },
      "cursos de assinatura encerrada migrados para a assinatura viva",
    )
  }
  return { adopted }
}
