import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { hashResetToken } from "@/lib/auth/reset-token"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

const schema = z.object({
  token: z.string().min(10, "Token inválido"),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .max(128),
})

export const POST = withRequestContext(
  { action: "auth.reset_password", route: "/api/auth/reset-password" },
  async (request: Request) => {
  const rl = await rateLimit(request, RATE_LIMITS.authReset)
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

  try {
    const passwordHash = await hash(data.password, 12)
    const tokenHash = hashResetToken(data.token)

    const user = await prisma.user.findUnique({
      where: { resetToken: tokenHash },
    })

    if (user) {
      if (
        !user.resetTokenExpires ||
        user.resetTokenExpires.getTime() < Date.now()
      ) {
        return NextResponse.json(
          { error: "Token expirado. Solicite um novo link.", code: "TOKEN_EXPIRED" },
          { status: 400 },
        )
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenExpires: null,
        },
      })

      return NextResponse.json({ data: { message: "Senha atualizada." } })
    }

    // Fallback: token de aluno
    const student = await prisma.student.findUnique({
      where: { resetToken: tokenHash },
    })

    if (!student) {
      return NextResponse.json(
        { error: "Token inválido", code: "INVALID_TOKEN" },
        { status: 400 },
      )
    }
    if (
      !student.resetTokenExpires ||
      student.resetTokenExpires.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Token expirado. Solicite um novo link.", code: "TOKEN_EXPIRED" },
        { status: 400 },
      )
    }

    await prisma.student.update({
      where: { id: student.id },
      data: {
        passwordHash,
        passwordSetAt: new Date(),
        resetToken: null,
        resetTokenExpires: null,
      },
    })

    return NextResponse.json({ data: { message: "Senha atualizada." } })
  } catch (error) {
    contextLogger().error(
      { err: error, event: "auth.reset_password.failed" },
      "reset-password falhou",
    )
    return NextResponse.json(
      { error: "Erro ao redefinir senha", code: "DB_ERROR" },
      { status: 500 },
    )
  }
  },
)
