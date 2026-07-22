/**
 * Motor da cota de aulas — aplica no mundo real o que `pace-gate.ts` calcula.
 *
 * A trava vive em dois lugares e eles precisam ser desarmados juntos:
 *   1. a matricula (`paceBlockedAt`), que a UI e a trava de certificado leem;
 *   2. o acesso do aluno na plataforma de aulas (`Student.status = DEVEDOR` +
 *      EA `devedor` / LMS `blocked`), que e por PESSOA — nao por matricula.
 *
 * O item 2 e o delicado: como o login da plataforma e unico por pessoa e
 * compartilhado entre unidades, so podemos liberar quando NENHUMA matricula
 * daquela pessoa ainda merece a trava.
 */
import { prisma } from "@/lib/prisma"
import {
  findPersonStudentIds,
  setStudentPaceBlock,
} from "@/lib/students/plataforma-actions"
import {
  evaluatePace,
  isPaceBlocked,
  isPaceGatedPlan,
  installmentWord,
  type PaceState,
} from "./pace-gate"
import { resolvePaceGateSettings } from "./pace-settings"
import { setLmsEnrollmentLimit, isLmsConfigured } from "@/lib/lms"
import { appUrl } from "@/lib/tenant/urls"
import { createNotification } from "@/lib/notifications"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"

/** Matriculas que ainda podem justificar a trava de ritmo. */
const LIVE_STATUSES = ["ACTIVE", "SUSPENDED"] as const

/** Campos minimos para decidir a cota de uma matricula. */
const PACE_SELECT = {
  id: true,
  tenantId: true,
  studentId: true,
  status: true,
  paymentType: true,
  installmentsPaid: true,
  installmentsTotal: true,
  progressPercent: true,
  paceBlockedAt: true,
  paceAppliedPercent: true,
  paceExemptAt: true,
  // Matricula no LMS: quando existe, a cota vai como TETO por matricula em vez
  // do corte por aluno. Ver applyLmsLimit.
  lmsEnrollmentId: true,
} as const

export interface PaceEvaluation {
  enrollmentId: string
  /** Fatia do curso liberada agora (0-100). */
  allowedPercent: number
  /** A matricula ficou travada ao fim desta avaliacao? */
  blocked: boolean
  /** Houve transicao (travou agora / liberou agora). */
  changed: boolean
  /** O acesso na plataforma de aulas foi de fato cortado/devolvido. */
  platformApplied: boolean
}

/**
 * Avalia a cota de UMA matricula e reconcilia o mundo com ela: trava quando o
 * aluno atinge a fatia paga, libera quando uma parcela nova entra.
 *
 * IDEMPOTENTE — so age na transicao. Chamada a cada sync de progresso, a cada
 * parcela paga e na varredura diaria; sem isso, rechamaria EA/LMS a cada rodada.
 *
 * Nunca lanca: a cota nao pode derrubar o sync de progresso nem o webhook de
 * pagamento que a invocou. Devolve null quando nao ha nada a avaliar.
 */
export async function evaluatePaceGate(
  enrollmentId: string,
): Promise<PaceEvaluation | null> {
  try {
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        ...PACE_SELECT,
        course: { select: { nome: true } },
        // `status` do aluno entra para detectar DERIVA: quem mais mexe neste
        // campo (auto-block/unblock do tenant, desbloqueio manual do admin,
        // reativacao ao vincular curso) pode ter devolvido o acesso sem saber
        // da cota. Ver o ramo de reconciliacao abaixo.
        student: { select: { nome: true, status: true } },
      },
    })
    if (!enrollment) return null

    // Matricula fora de operacao (CANCELLED/COMPLETED/PENDING): nao ha o que
    // travar. Se carregava a marca da cota, limpa — deixar o flag numa matricula
    // morta faria a UI mostrar "travado por parcelamento" num curso encerrado.
    if (enrollment.status !== "ACTIVE") {
      if (enrollment.paceBlockedAt) {
        await clearPaceFlags([enrollment.id])
        await releaseStudentPaceIfClear(enrollment.studentId)
      }
      return null
    }

    const { enabled, strict } = await resolvePaceGateSettings(enrollment.tenantId)

    // Interruptor desligado ou liberacao manual: garante que ninguem fique preso
    // por uma trava que nao vale mais. Desligar a feature TEM que soltar quem ela
    // travou — senao o "off" nao seria realmente off.
    if (!enabled || enrollment.paceExemptAt) {
      if (enrollment.paceBlockedAt) {
        await clearPaceFlags([enrollment.id])
        const released = await releaseStudentPaceIfClear(enrollment.studentId)
        return {
          enrollmentId: enrollment.id,
          allowedPercent: 100,
          blocked: false,
          changed: true,
          platformApplied: released,
        }
      }
      return null
    }

    const state = evaluatePace(enrollment)
    const wasBlocked = enrollment.paceBlockedAt !== null

    // `await` obrigatório (não `return applyBlock(...)`): sem ele a promise sai
    // do bloco try sem ser aguardada e uma rejeição escaparia do catch abaixo —
    // quebrando o contrato de "nunca lança" e derrubando o sync de progresso ou
    // o webhook de pagamento que chamou.
    if (state.blocked && !wasBlocked) {
      return await applyBlock(enrollment, state, strict)
    }
    if (!state.blocked && wasBlocked) {
      return await applyRelease(enrollment, state)
    }

    // Sem transicao — MAS o acesso na plataforma pode ter derivado. O campo
    // `Student.status` tem varios donos: o auto-block/unblock por inadimplencia
    // do tenant, o desbloqueio manual do admin/painel e a reativacao ao vincular
    // um curso novo. Qualquer um deles pode ter devolvido o acesso de um aluno
    // que continua travado pela cota — e, como nao houve transicao, nada
    // reaplicaria o corte: o aluno seguiria assistindo o que nao pagou.
    // ATIVO e o unico estado que indica deriva: BLOQUEADO pertence a trava mais
    // forte (inadimplencia) e DEVEDOR ja e a nossa, aplicada.
    if (state.blocked && wasBlocked && enrollment.student.status === "ATIVO") {
      const cut = await shouldCutPlatformAccess(enrollment, strict)
      if (cut) {
        const reapplied = await setStudentPaceBlock(enrollment.studentId, true).catch(
          (err) => {
            contextLogger().error(
              { err, event: "pace.reapply_failed", enrollmentId: enrollment.id },
              "reaplicacao do corte apos deriva falhou — proxima varredura re-tenta",
            )
            return false
          },
        )
        if (reapplied) {
          contextLogger().warn(
            { event: "pace.reapplied_after_drift", enrollmentId: enrollment.id, studentId: enrollment.studentId },
            "acesso do aluno havia sido devolvido por outro fluxo — corte da cota reaplicado",
          )
        }
        return {
          enrollmentId: enrollment.id,
          allowedPercent: state.allowedPercent,
          blocked: true,
          changed: reapplied,
          platformApplied: reapplied,
        }
      }
    }

    // Sem transicao. Só atualiza a cota exibida quando ela mudou (ex.: parcela
    // paga que aumentou a fatia sem destravar, porque o aluno ja passou dela).
    if (state.gated && enrollment.paceAppliedPercent !== state.allowedPercent) {
      await prisma.enrollment
        .update({
          where: { id: enrollment.id },
          data: { paceAppliedPercent: state.allowedPercent },
        })
        .catch(swallow("pace.update_applied_percent"))
      // A cota subiu sem destravar (o aluno ja passou dela): o teto no LMS
      // precisa acompanhar mesmo assim, senao o aluno pagou e continuaria
      // preso na fatia antiga.
      await applyLmsLimit(
        enrollment,
        state.allowedPercent >= 100 ? null : state.allowedPercent,
      )
    }
    return {
      enrollmentId: enrollment.id,
      allowedPercent: state.allowedPercent,
      blocked: state.blocked,
      changed: false,
      platformApplied: false,
    }
  } catch (err) {
    contextLogger().error(
      { err, event: "pace.evaluate_failed", enrollmentId },
      "avaliacao da cota de aulas falhou",
    )
    return null
  }
}

/**
 * Propaga a cota ao LMS como TETO POR MATRICULA (PATCH /enrollments/:id/limit).
 *
 * E o caminho preferencial sempre que a matricula for do LMS: ao contrario do
 * status da EA — que e por login e derrubaria os outros cursos da pessoa — o
 * teto vale so para esta matricula. Por isso NAO passa pela politica de
 * colateral: nao ha colateral a evitar.
 *
 * `percent` null remove o teto (quitado). Devolve false se a chamada falhou —
 * a varredura diaria re-tenta.
 */
async function applyLmsLimit(
  enrollment: { id: string; lmsEnrollmentId: string | null },
  percent: number | null,
): Promise<boolean> {
  if (!enrollment.lmsEnrollmentId || !isLmsConfigured()) return false
  try {
    await setLmsEnrollmentLimit(enrollment.lmsEnrollmentId, percent, {
      reason: "installment",
      unlockUrl: `${appUrl().replace(/\/$/, "")}/aluno/pagamentos`,
    })
    return true
  } catch (err) {
    contextLogger().error(
      {
        err,
        event: "pace.lms_limit_failed",
        enrollmentId: enrollment.id,
        lmsEnrollmentId: enrollment.lmsEnrollmentId,
        percent,
      },
      "envio da cota ao LMS falhou — varredura diaria re-tenta",
    )
    return false
  }
}

/** Trava a matricula e (se a politica permitir) corta o acesso na plataforma. */
async function applyBlock(
  enrollment: {
    id: string
    studentId: string
    tenantId: string | null
    paymentType: Parameters<typeof installmentWord>[0]
    lmsEnrollmentId: string | null
    course: { nome: string }
    student: { nome: string }
  },
  state: PaceState,
  strict: boolean,
): Promise<PaceEvaluation> {
  // LMS: teto por matricula, exato e sem colateral. So caimos no corte por
  // aluno (EA) quando a matricula nao e do LMS.
  let platformApplied = await applyLmsLimit(enrollment, state.allowedPercent)

  const cut = !platformApplied && (await shouldCutPlatformAccess(enrollment, strict))
  if (cut) {
    try {
      platformApplied = await setStudentPaceBlock(enrollment.studentId, true)
    } catch (err) {
      // A propagacao falhou (EA/LMS fora do ar). NAO abortamos: a marca local
      // ainda vale para a UI e para a trava de certificado, e a varredura diaria
      // re-tenta o corte. Abortar deixaria o aluno completamente destravado.
      contextLogger().error(
        { err, event: "pace.block_platform_failed", enrollmentId: enrollment.id },
        "corte do acesso na plataforma falhou — marca local aplicada mesmo assim",
      )
    }
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { paceBlockedAt: new Date(), paceAppliedPercent: state.allowedPercent },
  })

  const word = installmentWord(enrollment.paymentType)
  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "WARNING",
    title: `Aulas liberadas até ${state.allowedPercent}% — ${enrollment.course.nome}`,
    body:
      `Você já assistiu tudo o que as ${state.installmentsPaid} de ` +
      `${state.installmentsTotal} ${installmentWord(enrollment.paymentType, true)} pagas liberam. ` +
      `Pague a próxima ${word} para continuar de onde parou.`,
    category: "payment",
    href: "/aluno/pagamentos",
  }).catch(swallow("pace.notify_student_block"))

  if (enrollment.tenantId) {
    await createNotification({
      audience: "TENANT",
      tenantId: enrollment.tenantId,
      level: "INFO",
      title: `Cota de aulas atingida — ${enrollment.student.nome}`,
      body: `${enrollment.course.nome}: ${state.installmentsPaid}/${state.installmentsTotal} pagas. O acesso volta com a próxima ${word}.`,
      category: "payment",
      href: "/painel/financeiro",
    }).catch(swallow("pace.notify_tenant_block"))
  }

  contextLogger().info(
    {
      event: "pace.blocked",
      enrollmentId: enrollment.id,
      allowedPercent: state.allowedPercent,
      platformCut: platformApplied,
      strict,
    },
    "cota de aulas atingida — matricula travada",
  )

  return {
    enrollmentId: enrollment.id,
    allowedPercent: state.allowedPercent,
    blocked: true,
    changed: true,
    platformApplied,
  }
}

/** Libera a matricula (parcela nova entrou) e devolve o acesso, se puder. */
async function applyRelease(
  enrollment: {
    id: string
    studentId: string
    lmsEnrollmentId: string | null
    course: { nome: string }
  },
  state: PaceState,
): Promise<PaceEvaluation> {
  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { paceBlockedAt: null, paceAppliedPercent: state.allowedPercent },
  })

  // Quitado remove o teto; cota ampliada (mas ainda parcial) apenas sobe o teto.
  const lmsApplied = await applyLmsLimit(
    enrollment,
    state.allowedPercent >= 100 ? null : state.allowedPercent,
  )
  const platformApplied =
    (await releaseStudentPaceIfClear(enrollment.studentId)) || lmsApplied

  await createNotification({
    audience: "STUDENT",
    studentId: enrollment.studentId,
    level: "SUCCESS",
    title: `Novas aulas liberadas — ${enrollment.course.nome}`,
    body:
      state.allowedPercent >= 100
        ? "Curso quitado: todas as aulas e o certificado estão liberados."
        : `Pagamento confirmado. Você já pode assistir até ${state.allowedPercent}% do curso.`,
    category: "enrollment",
    href: "/aluno/cursos",
  }).catch(swallow("pace.notify_student_release"))

  contextLogger().info(
    {
      event: "pace.released",
      enrollmentId: enrollment.id,
      allowedPercent: state.allowedPercent,
      platformRestored: platformApplied,
    },
    "cota de aulas ampliada — matricula liberada",
  )

  return {
    enrollmentId: enrollment.id,
    allowedPercent: state.allowedPercent,
    blocked: false,
    changed: true,
    platformApplied,
  }
}

/**
 * Podemos cortar o acesso do aluno na plataforma de aulas?
 *
 * O `status` da EA e por LOGIN, nao por curso — e o login e compartilhado entre
 * unidades pela mesma pessoa. Cortar por causa de UM curso derruba todos os
 * outros, inclusive os ja quitados (28,6% dos logins tem mais de um curso ativo,
 * medido em prod em 2026-07-22).
 *
 * Politica padrao (`strict = false`): so corta quando NENHUMA outra matricula
 * viva da pessoa esta liberada. Nos demais casos a trava de aulas nao acontece —
 * mas a de CONCLUSAO (certificado) continua valendo, e e ela que impede o abuso.
 *
 * Recalcula a cota dos irmaos em vez de ler `paceBlockedAt`: duas matriculas que
 * batem a cota na mesma varredura precisam decidir igual, independentemente da
 * ordem em que forem avaliadas.
 */
async function shouldCutPlatformAccess(
  enrollment: { id: string; studentId: string },
  strict: boolean,
): Promise<boolean> {
  if (strict) return true

  const personIds = await findPersonStudentIds(enrollment.studentId)
  const siblings = await prisma.enrollment.findMany({
    where: {
      studentId: { in: personIds },
      status: { in: [...LIVE_STATUSES] },
      id: { not: enrollment.id },
    },
    select: PACE_SELECT,
  })

  const anyFree = siblings.some(
    (s) => s.paceExemptAt !== null || !isPaceGatedPlan(s) || !isPaceBlocked(s),
  )
  if (anyFree) {
    contextLogger().info(
      {
        event: "pace.skip_platform_cut",
        enrollmentId: enrollment.id,
        studentId: enrollment.studentId,
        freeSiblings: siblings.length,
      },
      "corte na plataforma pulado — o login tem outro curso liberado (trava de certificado segue valendo)",
    )
  }
  return !anyFree
}

/**
 * Libera o acesso do aluno na plataforma SE nenhuma matricula viva da mesma
 * pessoa ainda estiver sob a cota.
 *
 * Chamado quando algo remove uma matricula da equacao — hoje, o cancelamento
 * (`cancelEnrollment`). Sem isto, cancelar a matricula que causou a trava
 * deixaria o aluno preso em `DEVEDOR` para sempre, sem nada para reavalia-lo:
 * a matricula que o bloqueou nao existe mais, entao nenhuma varredura futura
 * chegaria ate ele.
 *
 * Best-effort: nunca lanca. Falhar em liberar nao pode derrubar a operacao que
 * chamou (o cancelamento em si ja foi concluido).
 */
export async function releaseStudentPaceIfClear(
  studentId: string,
): Promise<boolean> {
  try {
    // A pessoa pode ter varios Student (um por unidade) atras do MESMO login da
    // plataforma — a trava e por login, entao a decisao olha todos.
    const personIds = await findPersonStudentIds(studentId)
    if (personIds.length === 0) return false

    const live = await prisma.enrollment.findMany({
      where: {
        studentId: { in: personIds },
        status: { in: [...LIVE_STATUSES] },
      },
      select: {
        id: true,
        paymentType: true,
        installmentsPaid: true,
        installmentsTotal: true,
        progressPercent: true,
        paceExemptAt: true,
      },
    })

    // Recalcula em vez de confiar no `paceBlockedAt` persistido: a matricula
    // recem-cancelada ainda pode ter o flag ligado, e o estado da verdade e a
    // contagem de parcelas x progresso.
    const stillBlocked = live.some(
      (e) => !e.paceExemptAt && isPaceBlocked(e),
    )
    if (stillBlocked) return false

    const released = await setStudentPaceBlock(studentId, false)
    if (released) {
      contextLogger().info(
        { event: "pace.released_on_clear", studentId },
        "cota de aulas liberada — nenhuma matricula viva ainda travada",
      )
    }
    return released
  } catch (err) {
    contextLogger().error(
      { err, event: "pace.release_failed", studentId },
      "falha ao liberar a cota de aulas do aluno",
    )
    return false
  }
}

/**
 * Desarma o flag da cota nas matriculas indicadas. Usado quando elas saem de
 * cena (cancelamento) — deixar `paceBlockedAt` preenchido numa matricula morta
 * faria a UI mostrar "travado por parcelamento" num curso ja cancelado.
 */
export async function clearPaceFlags(enrollmentIds: string[]): Promise<void> {
  if (enrollmentIds.length === 0) return
  await prisma.enrollment
    .updateMany({
      where: { id: { in: enrollmentIds }, paceBlockedAt: { not: null } },
      data: { paceBlockedAt: null, paceAppliedPercent: null },
    })
    .catch(swallow("pace.clear_flags"))
}
