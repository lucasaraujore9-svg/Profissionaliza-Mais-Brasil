import { NextResponse } from "next/server"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import { startImpersonation } from "@/lib/auth/start-impersonation"
import { homeForRole } from "@/lib/auth/home-for-role"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { logAudit } from "@/lib/audit"

// POST /api/admin/equipe/[id]/impersonate — SUPER_ADMIN entra como um membro
// INTERNO da equipe PMB (vendedor, gerente, financeiro) para ver exatamente o
// que ele vê. Privilégio crítico, exclusivo do sistema-mãe → só SUPER_ADMIN.
//
// Revenda (RESELLER) e aluno (STUDENT) têm rotas próprias
// (/api/admin/revendedores/[id]/impersonate e /api/admin/alunos/[id]/impersonate)
// — aqui só os papéis internos do admin.
const IMPERSONATABLE_ROLES = [
  "PMB_SALES",
  "PMB_SALES_MGR",
  "PMB_REVENDA_SALES",
  "PMB_RESELLER_MGR",
  "PMB_FINANCEIRO",
] as const

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.equipe.impersonate", route: "/api/admin/equipe/[id]/impersonate" },
  async (_request: Request, { params }) => {
    const admin = await requireAdminSession()
    if (!admin) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (admin.role !== "SUPER_ADMIN") {
      contextLogger().warn(
        { event: "impersonate.denied", actorId: admin.userId, actorRole: admin.role },
        "tentativa de impersonate de equipe por papel não-SUPER_ADMIN",
      )
      return NextResponse.json({ error: "Permissão negada" }, { status: 403 })
    }

    const { id: userId } = await params

    // Não impersonar a si mesmo (sem efeito + confunde o backup da sessão).
    if (userId === admin.userId) {
      return NextResponse.json(
        { error: "Você já está logado como você mesmo." },
        { status: 400 },
      )
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, status: true },
    })
    if (!target) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 })
    }

    // Só papéis internos. SUPER_ADMIN é bloqueado (evita escalar para outro
    // super e confundir o fluxo de saída); RESELLER/STUDENT têm rotas próprias.
    if (!IMPERSONATABLE_ROLES.includes(target.role as (typeof IMPERSONATABLE_ROLES)[number])) {
      return NextResponse.json(
        { error: "Este usuário não pode ser impersonado por aqui." },
        { status: 400 },
      )
    }
    if (target.status !== "ATIVO") {
      return NextResponse.json(
        { error: "Usuário inativo — não é possível acessar como ele." },
        { status: 400 },
      )
    }

    // Membro interno não tem tenant nem studentId — sessão de admin pura.
    await startImpersonation({
      target: {
        sub: target.id,
        role: target.role,
        tenantId: null,
        studentId: null,
        email: target.email,
        name: target.name,
      },
      actor: { userId: admin.userId, name: admin.name, email: admin.email },
      targetLabel: target.name ?? target.email ?? "Equipe",
    })

    await logAudit({
      action: "impersonation.start",
      resource: "User",
      resourceId: target.id,
      actorUserId: admin.userId,
      actorRole: admin.role,
      actorEmail: admin.email,
      tenantId: null,
      payloadAfter: { targetUserId: target.id, targetRole: target.role },
    })

    return NextResponse.json({ data: { redirect: homeForRole(target.role) } })
  },
)
