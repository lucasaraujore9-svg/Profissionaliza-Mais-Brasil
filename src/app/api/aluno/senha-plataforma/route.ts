import { NextResponse } from "next/server"
import { z } from "zod"
import { requireStudentSession } from "@/lib/auth/student-session"
import { changeStudentPlatformPassword } from "@/lib/students/plataforma-actions"
import {
  PLATFORM_PASSWORD_UNSUPPORTED_STUDENT,
  PLATFORM_PASSWORD_UNVERIFIED,
} from "@/lib/students/platform-credentials"
import { rateLimitByKey, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { EAApiError, EANetworkError } from "@/lib/plataforma-cursos/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const patchSchema = z.object({
  // Senha da plataforma de aulas (EA). Sem espacos para nao quebrar o login.
  newPassword: z
    .string()
    .min(4, "A senha precisa ter pelo menos 4 caracteres")
    .max(30, "A senha pode ter no maximo 30 caracteres")
    .regex(/^\S+$/, "A senha nao pode conter espacos"),
})

export const PATCH = withRequestContext(
  { action: "aluno.senha-plataforma.update", route: "/api/aluno/senha-plataforma" },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    // Cada chamada custa DUAS idas à Escola Avançada (escrever + reler para
    // conferir) e hoje a EA sempre recusa a troca — ou seja, é um endpoint que
    // só gasta cota externa. Chaveado pelo aluno, como o de credenciais.
    const rl = await rateLimitByKey(
      session.studentId,
      RATE_LIMITS.alunoSenhaPlataforma,
    )
    if (!rl.ok) return rateLimitResponse(rl)

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = patchSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Senha inválida",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    try {
      const { onPlatform, applied, effectivePassword } =
        await changeStudentPlatformPassword(
          session.studentId,
          parsed.data.newPassword,
        )

      if (!onPlatform) {
        return NextResponse.json(
          {
            error:
              "Você ainda não tem acesso à plataforma de aulas. Conclua uma compra para liberar o acesso.",
          },
          { status: 409 },
        )
      }

      // A plataforma de aulas descarta a troca de senha e responde "sucesso".
      // Antes esse falso positivo virava "senha atualizada" na tela — e o aluno
      // ficava sem conseguir entrar. Agora falha de forma honesta.
      if (!applied) {
        return NextResponse.json(
          {
            error: effectivePassword
              ? PLATFORM_PASSWORD_UNSUPPORTED_STUDENT
              : PLATFORM_PASSWORD_UNVERIFIED,
          },
          { status: 422 },
        )
      }

      return NextResponse.json({ data: { ok: true } })
    } catch (err) {
      contextLogger().error(
        {
          err,
          event: "aluno.senha-plataforma.failed",
          studentId: session.studentId,
        },
        "falha ao alterar senha na plataforma de aulas",
      )
      if (err instanceof EAApiError || err instanceof EANetworkError) {
        return NextResponse.json(
          {
            error:
              "A plataforma de aulas está indisponível no momento. Tente novamente em alguns minutos.",
          },
          { status: 502 },
        )
      }
      return NextResponse.json(
        { error: "Falha ao alterar a senha. Tente novamente." },
        { status: 500 },
      )
    }
  },
)
