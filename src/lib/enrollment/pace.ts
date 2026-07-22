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
import { isPaceBlocked } from "./pace-gate"
import { contextLogger } from "@/lib/logger"
import { swallow } from "@/lib/errors"

/** Matriculas que ainda podem justificar a trava de ritmo. */
const LIVE_STATUSES = ["ACTIVE", "SUSPENDED"] as const

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
