import { cookies } from "next/headers"
import { auth } from "@/lib/auth"
import { decodeSessionToken, sessionCookieName } from "@/lib/auth/impersonate"

export interface StudentSession {
  studentId: string
  email: string
  name?: string
  tenantId: string | null
  /**
   * Sessão deste login (um acesso por vez). null no "entrar como" do suporte —
   * o SSO para a plataforma de aulas usa isso para não derrubar o aluno.
   */
  sessionId: string | null
}

export async function requireStudentSession(): Promise<StudentSession | null> {
  const session = await auth()
  const user = session?.user as
    | {
        id?: string
        role?: string
        email?: string
        name?: string
        tenantId?: string | null
        studentId?: string | null
        sessionId?: string | null
      }
    | undefined
  if (!user || user.role !== "STUDENT" || !user.studentId || !user.email) {
    return null
  }
  return {
    studentId: user.studentId,
    email: user.email,
    name: user.name,
    tenantId: user.tenantId ?? null,
    sessionId: user.sessionId ?? null,
  }
}

/**
 * A sessão de aluno deste navegador foi ENCERRADA por um login em outro
 * aparelho? (um acesso por vez — `lib/auth/single-session.ts`)
 *
 * Só faz sentido quando `requireStudentSession()` já devolveu null: se o cookie
 * ainda decifra como um JWT de aluno válido e mesmo assim a sessão foi recusada,
 * quem a recusou foi a checagem de sessão ativa. Cookie ausente, expirado ou de
 * outro papel responde false — ali o motivo é outro e o aviso mentiria. JWT sem
 * `sid` também: é o token emitido antes da regra, que cai uma vez no deploy sem
 * que ninguém tenha entrado em outro aparelho.
 */
export async function studentSessionWasReplaced(): Promise<boolean> {
  const raw = (await cookies()).get(sessionCookieName())?.value
  if (!raw) return false
  const decoded = await decodeSessionToken(raw).catch(() => null)
  return decoded?.role === "STUDENT" && decoded.sid !== null
}

/** Destino do aluno cuja sessão caiu, com o aviso quando o motivo é o outro aparelho. */
export const SESSION_REPLACED_LOGIN_PATH = "/login?motivo=outro-acesso"
