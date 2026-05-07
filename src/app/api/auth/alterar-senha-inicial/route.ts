import { NextResponse } from "next/server"
import { z } from "zod"
import { hash } from "bcryptjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const bodySchema = z.object({
  newPassword: z.string().min(8, "A senha deve ter no mínimo 8 caracteres"),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const userId = session.user.id
  if (!userId) {
    return NextResponse.json({ error: "Sessão inválida" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const firstError = Object.values(parsed.error.flatten().fieldErrors).flat()[0]
    return NextResponse.json(
      { error: firstError ?? "Dados inválidos" },
      { status: 400 },
    )
  }

  const passwordHash = await hash(parsed.data.newPassword, 10)

  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({ data: { ok: true } })
}
