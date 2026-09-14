import { isLmsConfigured, LmsApiError, setLmsStudentSession } from "@/lib/lms"
import { contextLogger } from "@/lib/logger"

/**
 * Leva à plataforma de aulas o `sid` do login que acabou de acontecer aqui, para
 * a sessão aberta lá em OUTRO aparelho deixar de valer (um acesso por vez — ver
 * `lib/auth/single-session.ts`).
 *
 * Best-effort e nunca lança: roda depois da resposta do login. Se falhar, a
 * regra ainda se fecha no primeiro "Acessar aulas" deste aparelho, porque o SSO
 * leva o mesmo `sid` e ocupa o lugar do outro.
 */
export async function pushStudentSessionToLms(
  studentId: string,
  sessionId: string,
): Promise<void> {
  if (!isLmsConfigured()) return
  try {
    await setLmsStudentSession(studentId, sessionId)
  } catch (err) {
    // 404: aluno que nunca teve curso na plataforma — não há sessão lá a
    // derrubar. É o caso da maioria dos logins, então não é aviso.
    if (err instanceof LmsApiError && err.statusCode === 404) return
    contextLogger().warn(
      { err, event: "auth.student_session.lms_push_failed", studentId },
      "não foi possível avisar a plataforma de aulas do login novo",
    )
  }
}
