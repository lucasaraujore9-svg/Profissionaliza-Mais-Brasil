import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { z, ZodError } from "zod"
import { prisma } from "@/lib/prisma"

const schema = z.object({
  token: z.string().min(10, "Token inválido"),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .max(128),
})

export async function POST(request: Request) {
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
    const user = await prisma.user.findUnique({
      where: { resetToken: data.token },
    })

    if (!user || !user.resetTokenExpires) {
      return NextResponse.json(
        { error: "Token inválido", code: "INVALID_TOKEN" },
        { status: 400 },
      )
    }

    if (user.resetTokenExpires.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "Token expirado. Solicite um novo link.", code: "TOKEN_EXPIRED" },
        { status: 400 },
      )
    }

    const passwordHash = await hash(data.password, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null,
      },
    })

    return NextResponse.json({ data: { message: "Senha atualizada." } })
  } catch (error) {
    console.error("[reset-password] error:", error)
    return NextResponse.json(
      { error: "Erro ao redefinir senha", code: "DB_ERROR" },
      { status: 500 },
    )
  }
}
