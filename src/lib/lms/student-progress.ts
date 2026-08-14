import { prisma } from "@/lib/prisma"
import { getLmsStudent } from "./client"
import { isLmsConfigured } from "./config"
import { applyLmsCourseProgress } from "./apply-progress"
import { contextLogger } from "@/lib/logger"

const SETTINGS_ID = "default"

export interface LmsStudentProgressResult {
  updated: number
  certificatesIssued: number
}

/**
 * Atualiza o progresso das matrículas LMS de UM aluno, na hora.
 *
 * O canal normal do LMS é o delta horário (`syncLmsDayUpdate`), que varre todo
 * mundo a partir de um cursor. Ele não serve para "atualizar agora": o cursor é
 * global, então forçá-lo por um aluno reprocessaria a base inteira e ainda
 * avançaria o cursor de todos. Aqui a pergunta é pontual —
 * `GET /students/:ref` — e o resultado é aplicado pelo MESMO aplicador do delta.
 *
 * Sem esta função o botão "Atualizar progresso" seria mudo para as matrículas
 * LMS (~1 em cada 5 em produção), porque `syncStudentProgress` só fala com a EA.
 */
export async function syncLmsStudentProgress(
  studentId: string,
): Promise<LmsStudentProgressResult> {
  const empty: LmsStudentProgressResult = { updated: 0, certificatesIssued: 0 }
  if (!isLmsConfigured()) return empty

  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      // Mesmo recorte do delta: SUSPENDED entra porque o aluno inadimplente
      // pode ter concluído antes de ser bloqueado.
      status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
      course: { lmsCourseId: { not: null } },
    },
    select: { id: true, course: { select: { lmsCourseId: true } } },
  })
  if (enrollments.length === 0) return empty

  // Indexa por curso do LMS. Primeira ocorrência vence — mesmo desempate do
  // delta, para os dois caminhos escolherem a mesma matrícula quando houver
  // duplicata do par (aluno, curso).
  const byLmsCourseId = new Map<string, string>()
  for (const e of enrollments) {
    const lmsCourseId = e.course?.lmsCourseId
    if (!lmsCourseId) continue
    if (!byLmsCourseId.has(lmsCourseId)) byLmsCourseId.set(lmsCourseId, e.id)
  }

  const settings = await prisma.systemSettings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
    select: { certificateAutoIssue: true },
  })

  let profileCourses
  try {
    // O ref do aluno no LMS é o nosso `Student.id` (foi ele que enviamos como
    // externalId ao matricular) — mesmo caminho de `lms-credentials.ts`.
    const profile = await getLmsStudent(studentId)
    profileCourses = profile.courses
  } catch (err) {
    // Aluno ainda não existe no LMS (404) ou a fornecedora está fora: degrada
    // para "nada atualizado". Quem chama trata como ausência de novidade — não
    // pode derrubar a atualização da EA, que roda no mesmo pedido.
    contextLogger().warn(
      { err, event: "lms.student_progress.fetch_failed", studentId },
      "falha ao ler o perfil do aluno no LMS — progresso LMS não atualizado",
    )
    return empty
  }

  let updated = 0
  let certificatesIssued = 0
  for (const course of profileCourses) {
    const enrollmentId = byLmsCourseId.get(course.courseId)
    if (!enrollmentId) continue
    const applied = await applyLmsCourseProgress(enrollmentId, course, {
      autoIssue: settings.certificateAutoIssue,
      event: "lms.student_progress",
    })
    updated += 1
    if (applied.certificateIssued) certificatesIssued += 1
  }

  return { updated, certificatesIssued }
}
