import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { sendInvite } from "@/lib/auth/invite"

const PMB_ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] as const

export async function GET() {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const users = await prisma.user.findMany({
    where: { role: { in: [...PMB_ROLES] } },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      phone: true,
      lastActiveAt: true,
      passwordHash: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json({
    data: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      phone: u.phone,
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
      pendingInvite: !u.passwordHash,
      createdAt: u.createdAt.toISOString(),
    })),
  })
}

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(PMB_ROLES),
  phone: z.string().optional(),
})

export async function POST(req: Request) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (existing) {
    return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 })
  }

  // passwordHash vazio marca convite pendente — hash gerado no set-password
  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      phone: parsed.data.phone,
      passwordHash: "",
      status: "ATIVO",
    },
    select: { id: true, name: true, email: true, role: true },
  })

  const inviter = await prisma.user.findUnique({
    where: { id: guard.session.userId },
    select: { name: true },
  })

  await sendInvite({
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    inviterName: inviter?.name ?? "Equipe PMB",
    role: user.role,
    context: "pmb_team",
  })

  return NextResponse.json({ data: user }, { status: 201 })
}
