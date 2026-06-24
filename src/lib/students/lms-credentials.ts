import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { contextLogger } from "@/lib/logger"

export interface LmsEnrollmentCredentials {
  enrollmentId: string
  courseId: string
  courseNome: string
  /** "own" (curso proprio do LMS) | chave do parceiro (ex: "escola-avancada"). */
  origin: string | null
  /**
   * "local" (player do LMS via SSO) | "redirect" (assiste no parceiro). null em
   * matricula anterior a migration de credenciais → tratar como local/SSO.
   */
  playback: string | null
  login: string
  /**
   * Senha decifrada. `null` quando ausente ou corrompida (degrada sem quebrar a
   * pagina — o aluno usa a senha recebida por email).
   */
  senha: string | null
  /** URL do portal do parceiro (acesso direto em cursos redirect). */
  portalUrl: string | null
}

/**
 * Credenciais de acesso a plataforma do LMS por matricula (curso proprio do LMS
 * ou parceiro), para a area do aluno. Espelha getStudentPlatformCredentials (EA):
 * so matricula ACTIVE/COMPLETED (pagamento confirmado) e senha decifrada com
 * try/catch degradando a `null`.
 *
 * Passe SEMPRE o studentId da SESSAO (nunca um id vindo de query param) — o
 * isolamento por aluno depende disso.
 */
export async function getLmsEnrollmentCredentials(
  studentId: string,
): Promise<LmsEnrollmentCredentials[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      status: { in: ["ACTIVE", "COMPLETED"] },
      lmsLogin: { not: null },
    },
    select: {
      id: true,
      courseId: true,
      lmsOrigin: true,
      lmsPlayback: true,
      lmsLogin: true,
      lmsSenha: true,
      lmsPortalUrl: true,
      course: { select: { nome: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return enrollments.map((e) => {
    let senha: string | null = null
    if (e.lmsSenha) {
      try {
        senha = decrypt(e.lmsSenha)
      } catch (err) {
        // Valor corrompido/legado — degrada para "senha por email" em vez de quebrar.
        contextLogger().warn(
          {
            err,
            event: "aluno.lms_credentials.decrypt_failed",
            studentId,
            enrollmentId: e.id,
          },
          "falha ao descriptografar senha do LMS — exibindo só o login",
        )
        senha = null
      }
    }
    return {
      enrollmentId: e.id,
      courseId: e.courseId,
      courseNome: e.course.nome,
      origin: e.lmsOrigin,
      playback: e.lmsPlayback,
      login: e.lmsLogin as string, // garantido pelo filtro lmsLogin != null
      senha,
      portalUrl: e.lmsPortalUrl,
    }
  })
}
