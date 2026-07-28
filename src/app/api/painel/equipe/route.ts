import { NextResponse } from "next/server"
import { z } from "zod"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { requireResellerOwner } from "@/lib/auth/guards"
import { auth } from "@/lib/auth"
import { sendInvite } from "@/lib/auth/invite"
import { generateTempPassword, sendCredentialsEmail } from "@/lib/auth/credentials"
import { tenantEmailBrand } from "@/lib/email/brand"
import { withRequestContext } from "@/lib/observability/with-request-context"
import {
  ASSIGNABLE_MEMBER_ROLES,
  OWNER_EXCLUSIVE,
  PAINEL_PERMISSIONS,
  filterPainelPermissions,
  normalizeMemberRole,
  resolvePermissions,
  roleLabel,
} from "@/lib/auth/painel-permissions"

const OWNER_EXCLUSIVE_SET = new Set<string>(OWNER_EXCLUSIVE)

/**
 * Overrides por pessoa. `extraPermissions` NUNCA concede uma permissao
 * exclusiva do dono — rejeitamos aqui (400) alem de o resolvedor ignorar.
 */
const permissionList = z.array(z.enum(PAINEL_PERMISSIONS)).max(PAINEL_PERMISSIONS.length)

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

    // Lista TODOS os papeis da unidade (antes so "consultant" existia).
    const members = await prisma.tenantMember.findMany({
      where: { tenantId },
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
      data: members.map((m) => {
        const role = normalizeMemberRole(m.role)
        return {
        membershipId: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role,
        extraPermissions: filterPainelPermissions(m.extraPermissions),
        revokedPermissions: filterPainelPermissions(m.revokedPermissions),
        // Conjunto efetivo — a UI marca os checkboxes a partir dele.
        permissions: [...resolvePermissions(role, m.extraPermissions, m.revokedPermissions)],
        maxDiscount: m.maxDiscount,
        status: m.status,
        pendingInvite: !m.user.passwordHash,
        lastActiveAt: m.user.lastActiveAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
        }
      }),
    })
  },
)

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(ASSIGNABLE_MEMBER_ROLES).default("consultant"),
  extraPermissions: permissionList.optional(),
  revokedPermissions: permissionList.optional(),
  maxDiscount: z.number().int().min(0).max(100).optional(),
  // "invite" (padrão): envia link para o consultor definir a senha.
  // "password": cria a conta já com senha e envia as credenciais por email.
  mode: z.enum(["invite", "password"]).default("invite"),
  password: z.string().min(8).max(72).optional(),
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

    // Barreira de escalada: nenhum override pode conceder permissao exclusiva
    // do dono (gerir a equipe / excluir a conta). O resolvedor tambem ignora,
    // mas rejeitar aqui deixa o erro visivel em vez de silencioso.
    const escalating = (parsed.data.extraPermissions ?? []).filter((perm) =>
      OWNER_EXCLUSIVE_SET.has(perm),
    )
    if (escalating.length > 0) {
      return NextResponse.json(
        {
          error: "Estas permissões são exclusivas do titular da unidade",
          fields: { extraPermissions: escalating },
        },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        customDomain: true,
        domainVerified: true,
        supportEmail: true,
      },
    })
    if (!tenant) return NextResponse.json({ error: "Tenant não encontrado" }, { status: 404 })

    // Usuário pode já existir — verificar
    const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } })

    const usePassword = parsed.data.mode === "password"
    // Só emite credencial/convite se a conta ainda não tinha senha utilizável
    // (conta nova ou convite pendente). Usuário já ativo mantém a senha atual.
    const hadPassword = !!existing?.passwordHash
    const tempPassword =
      usePassword && !hadPassword
        ? parsed.data.password || generateTempPassword()
        : null
    const newHash = tempPassword ? await hash(tempPassword, 12) : ""

    const user = existing
      ? // Convite pendente + modo senha: grava a senha agora.
        tempPassword
        ? await prisma.user.update({
            where: { id: existing.id },
            data: { passwordHash: newHash, mustChangePassword: true },
          })
        : existing
      : await prisma.user.create({
          data: {
            name: parsed.data.name,
            email: parsed.data.email,
            role: "RESELLER",
            passwordHash: newHash,
            mustChangePassword: usePassword,
            status: "ATIVO",
          },
        })

    const memberData = {
      role: parsed.data.role,
      extraPermissions: parsed.data.extraPermissions ?? [],
      revokedPermissions: parsed.data.revokedPermissions ?? [],
      maxDiscount: parsed.data.maxDiscount ?? null,
      status: "ATIVO",
    }
    const membership = await prisma.tenantMember.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: { tenantId, userId: user.id, ...memberData },
      update: memberData,
    })

    let emailSent = false

    // Só notifica contas que ainda não tinham senha (nova ou convite pendente).
    if (!hadPassword) {
      if (tempPassword) {
        emailSent = await sendCredentialsEmail({
          userName: user.name,
          userEmail: user.email,
          tempPassword,
          contextLabel: tenant.name,
          roleLabel: roleLabel(parsed.data.role),
          brand: tenantEmailBrand(tenant),
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
          inviterName: inviter?.name ?? "Equipe",
          role: parsed.data.role,
          context: "reseller_consultant",
          tenantName: tenant.name,
          brand: tenantEmailBrand(tenant),
        })
      }
    }

    return NextResponse.json(
      {
        data: {
          membershipId: membership.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          role: membership.role,
        },
        mode: parsed.data.mode,
        tempPassword,
        emailSent: tempPassword ? emailSent : true,
      },
      { status: 201 },
    )
  },
)
