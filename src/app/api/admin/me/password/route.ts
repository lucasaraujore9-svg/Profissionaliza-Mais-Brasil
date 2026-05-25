import { NextResponse } from "next/server"
import { z } from "zod"
import { compare, hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { withRequestContext } from "@/lib/observability/with-request-context"

const bodySchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: z.string().min(8, "Nova senha precisa ter pelo menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Confirmação não confere",
    path: ["confirmPassword"],
  })

export const PUT = withRequestContext(
  { action: "admin.me.password.update", route: "/api/admin/me/password" },
  async (request: Request) => {
  const ctx = await requireAdminSession()
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { passwordHash: true },
  })
  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  }

  const valid = await compare(parsed.data.currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json(
      {
        error: "Senha atual incorreta",
        fields: { currentPassword: ["Senha atual incorreta"] },
      },
      { status: 400 },
    )
  }

  const newHash = await hash(parsed.data.newPassword, 12)
  await prisma.user.update({
    where: { id: ctx.userId },
    data: { passwordHash: newHash },
  })

  return NextResponse.json({ data: { ok: true } })
  },
)
