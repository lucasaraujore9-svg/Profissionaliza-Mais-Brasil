import { NextResponse } from "next/server"
import { z } from "zod"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { sendInvite } from "@/lib/auth/invite"
import { generateTempPassword, sendCredentialsEmail } from "@/lib/auth/credentials"
import { withRequestContext } from "@/lib/observability/with-request-context"

const PMB_ROLES = ["SUPER_ADMIN", "PMB_SALES", "PMB_RESELLER_MGR"] as const

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  PMB_SALES: "Vendas PMB",
  PMB_RESELLER_MGR: "Gerente de Revendedores",
}

export const GET = withRequestContext(
  { action: "admin.equipe.list", route: "/api/admin/equipe" },
  async () => {
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
  },
)

const createSchema = z
  .object({
    name: z.string().min(2),
    email: z.string().trim().toLowerCase().email(),
    role: z.enum(PMB_ROLES),
    phone: z.string().optional(),
    // "invite" (padrão): envia link para o usuário definir a senha.
    // "password": cria a conta já com senha e envia as credenciais por email.
    mode: z.enum(["invite", "password"]).default("invite"),
    // Senha opcional no modo "password": vazio → gerada automaticamente.
    password: z.string().min(8).max(72).optional(),
  })
  .refine((d) => d.mode !== "password" || !d.password || d.password.length >= 8, {
    message: "A senha deve ter no mínimo 8 caracteres",
    path: ["password"],
  })

export const POST = withRequestContext(
  { action: "admin.equipe.create", route: "/api/admin/equipe" },
  async (req: Request) => {
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

  const usePassword = parsed.data.mode === "password"
  // No modo "password": gera (ou usa) a senha agora e exige troca no 1º acesso.
  // No modo "invite": passwordHash vazio marca convite pendente — hash gerado no set-password.
  const tempPassword = usePassword
    ? parsed.data.password || generateTempPassword()
    : null
  const passwordHash = tempPassword ? await hash(tempPassword, 12) : ""

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      phone: parsed.data.phone,
      passwordHash,
      mustChangePassword: usePassword,
      status: "ATIVO",
    },
    select: { id: true, name: true, email: true, role: true },
  })

  let emailSent = false

  if (usePassword && tempPassword) {
    emailSent = await sendCredentialsEmail({
      userName: user.name,
      userEmail: user.email,
      tempPassword,
      contextLabel: "Equipe PMB",
      roleLabel: ROLE_LABEL[user.role] ?? user.role,
    })
  } else {
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
  }

  return NextResponse.json(
    {
      data: user,
      mode: parsed.data.mode,
      // Retornamos a senha só no modo "password" para o admin exibir/repassar.
      // (já está no formulário; aqui cobre o caso de senha gerada no servidor.)
      tempPassword: usePassword ? tempPassword : null,
      emailSent: usePassword ? emailSent : true,
    },
    { status: 201 },
  )
  },
)
