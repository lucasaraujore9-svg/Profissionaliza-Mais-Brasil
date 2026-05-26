import { NextResponse } from "next/server"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { generateResetToken } from "@/lib/auth/reset-token"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const RESET_EXPIRATION_MINUTES = 5

const schema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

export const POST = withRequestContext(
  { action: "auth.forgot_password", route: "/api/auth/forgot-password" },
  async (request: Request) => {
  const rl = await rateLimit(request, RATE_LIMITS.authForgot)
  if (!rl.ok) return rateLimitResponse(rl)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: "JSON inválido", code: "INVALID_JSON" },
      { status: 400 },
    )
  }

  let data: z.infer<typeof schema>
  try {
    data = schema.parse(payload)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          code: "VALIDATION_ERROR",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }
    throw error
  }

  // Always respond 200 to avoid email enumeration attacks.
  // Resposta também é enviada SEM esperar o envio do email (fire-and-forget)
  // para evitar timing attack: antes, a latência da resposta correlacionava
  // com a existência do user no banco (lookup + envio de email era ~500ms;
  // sem user a resposta voltava em ~50ms). Atacante poderia enumerar emails
  // medindo latência. Agora o processamento corre em background e a
  // resposta volta imediata em ambos os casos.
  const response = NextResponse.json({
    data: { message: "Se o email existir, um link de redefinição foi enviado." },
  })

  void processForgotPassword(data.email).catch((error) => {
    contextLogger().error(
      { err: error, event: "auth.forgot_password.background_failed" },
      "forgot-password background processing falhou",
    )
  })

  return response
  },
)

async function processForgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } })

  const { plain: token, hash: tokenHash } = generateResetToken()
  const expires = new Date(Date.now() + RESET_EXPIRATION_MINUTES * 60 * 1000)
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://profissionalizamaisbrasil.com.br"
  const resetUrl = `${appUrl}/reset-password?token=${token}`

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: tokenHash, resetTokenExpires: expires },
    })

    await sendEmail({
      to: user.email,
      subject: "Redefinir sua senha",
      template: {
        type: "reset-password",
        props: {
          userName: user.name,
          resetUrl,
          expirationMinutes: RESET_EXPIRATION_MINUTES,
        },
      },
    })
    return
  }

  // Fallback: tenta como aluno
  const student = await prisma.student.findFirst({
    where: { email },
    select: { id: true, nome: true, email: true },
  })
  if (!student?.email) return

  await prisma.student.update({
    where: { id: student.id },
    data: { resetToken: tokenHash, resetTokenExpires: expires },
  })

  await sendEmail({
    to: student.email,
    subject: "Definir senha de acesso à área do aluno",
    template: {
      type: "reset-password",
      props: {
        userName: student.nome,
        resetUrl,
        expirationMinutes: RESET_EXPIRATION_MINUTES,
      },
    },
  })
}
