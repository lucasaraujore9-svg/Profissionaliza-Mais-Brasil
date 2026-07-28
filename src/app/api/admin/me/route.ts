import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

const updateSchema = z.object({
  name: z.string().trim().min(3, "Nome muito curto").max(120),
  email: z.string().trim().toLowerCase().email("Email inválido").max(160),
  phone: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((v) => (v ? v : null)),
})

export const GET = withRequestContext(
  { action: "admin.me.get", route: "/api/admin/me" },
  async () => {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      image: true,
      lastActiveAt: true,
    },
  })

  if (!user) {
    return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
  }

  return NextResponse.json({ data: { user } })
  },
)

export const PUT = withRequestContext(
  { action: "admin.me.update", route: "/api/admin/me" },
  async (request: Request) => {
  const guard = await requireAdmin("perfil.edit")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = updateSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    )
  }

  const emailTaken = await prisma.user.findFirst({
    where: { email: parsed.data.email, NOT: { id: ctx.userId } },
    select: { id: true },
  })
  if (emailTaken) {
    return NextResponse.json(
      {
        error: "Email já está em uso",
        fields: { email: ["Email já está em uso"] },
      },
      { status: 409 },
    )
  }

  const user = await prisma.user.update({
    where: { id: ctx.userId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
    },
  })

  return NextResponse.json({ data: { user } })
  },
)
