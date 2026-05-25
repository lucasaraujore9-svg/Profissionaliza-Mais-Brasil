import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerOwner } from "@/lib/auth/guards"
import { auth } from "@/lib/auth"
import { sendInvite } from "@/lib/auth/invite"
import { withRequestContext } from "@/lib/observability/with-request-context"

async function currentTenantId(): Promise<string | null> {
  const session = await auth()
  const user = session?.user as { tenantId?: string | null } | undefined
  return user?.tenantId ?? null
}

export const GET = withRequestContext(
  { action: "painel.equipe.list", route: "/api/painel/equipe" },
  async () => {
    const tenantId = await currentTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 403 })
    }
    const guard = await requireResellerOwner(tenantId)
    if (!guard.ok) return guard.response

    const members = await prisma.tenantMember.findMany({
      where: { tenantId, role: "consultant" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            lastActiveAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      data: members.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        maxDiscount: m.maxDiscount,
        status: m.status,
        pendingInvite: !m.user.passwordHash,
        lastActiveAt: m.user.lastActiveAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    })
  },
)

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  maxDiscount: z.number().int().min(0).max(100).optional(),
})

export const POST = withRequestContext(
  { action: "painel.equipe.create", route: "/api/painel/equipe" },
  async (req: Request) => {
    const tenantId = await currentTenantId()
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant não encontrado" }, { status: 403 })
    }
    const guard = await requireResellerOwner(tenantId)
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

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
    if (!tenant) return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })

    // Usuário pode já existir — verificar
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })

    const user =
      existing ??
      (await prisma.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          role: "RESELLER",
          passwordHash: "",
          status: "ATIVO",
        },
      }))

    const membership = await prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: {
        tenantId,
        userId: user.id,
        role: "consultant",
        maxDiscount: parsed.data.maxDiscount ?? null,
        status: "ATIVO",
      },
      update: {
        role: "consultant",
        maxDiscount: parsed.data.maxDiscount ?? null,
        status: "ATIVO",
      },
    })

    const inviter = await prisma.user.findUnique({
      where: { id: guard.session.userId },
      select: { name: true },
    })

    if (!user.passwordHash) {
      await sendInvite({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        inviterName: inviter?.name ?? "Equipe",
        role: "consultant",
        context: "reseller_consultant",
        tenantName: tenant.name,
      })
    }

    return NextResponse.json(
      {
        data: {
          membershipId: membership.id,
          userId: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 },
    )
  },
)
