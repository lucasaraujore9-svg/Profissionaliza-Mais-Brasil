import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email/resend"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"

const RESET_EXPIRATION_MINUTES = 5

const schema = z.object({
  email: z.string().email().toLowerCase().trim(),
})

export async function POST(request: Request) {
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

  // Always respond 200 to avoid email enumeration attacks
  const response = NextResponse.json({
    data: { message: "Se o email existir, um link de redefinição foi enviado." },
  })

  try {
    const user = await prisma.user.findUnique({ where: { email: data.email } })

    const token = randomBytes(32).toString("hex")
    const expires = new Date(Date.now() + RESET_EXPIRATION_MINUTES * 60 * 1000)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://profissionalizamaisbrasil.com.br"
    const resetUrl = `${appUrl}/reset-password?token=${token}`

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpires: expires },
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
      return response
    }

    // Fallback: tenta como aluno
    const student = await prisma.student.findFirst({
      where: { email: data.email },
      select: { id: true, nome: true, email: true },
    })
    if (!student?.email) return response

    await prisma.student.update({
      where: { id: student.id },
      data: { resetToken: token, resetTokenExpires: expires },
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
  } catch (error) {
    console.error("[forgot-password] error:", error)
  }

  return response
}
