import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { prisma } from "@/lib/prisma"
import {
  buildSessionToken,
  cookieSecure,
  encodeImpersonationFlag,
  IMPERSONATION_BACKUP_COOKIE,
  IMPERSONATION_FLAG_COOKIE,
  sessionCookieName,
} from "@/lib/auth/impersonate"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

export const POST = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.impersonate", route: "/api/admin/revendedores/[id]/impersonate" },
  async (_request: Request, { params }) => {
  const admin = await requireAdminSession()
  if (!admin) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { id: tenantId } = await params

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, slug: true },
  })
  if (!tenant) {
    return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
  }

  // Owner do tenant: usuário com role RESELLER e tenantId igual.
  const owner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "RESELLER" },
    select: { id: true, name: true, email: true, role: true, tenantId: true },
    orderBy: { createdAt: "asc" },
  })
  if (!owner) {
    return NextResponse.json(
      { error: "Este revendedor ainda não tem usuário responsável" },
      { status: 400 },
    )
  }

  const targetToken = await buildSessionToken({
    sub: owner.id,
    role: owner.role,
    tenantId: owner.tenantId,
    email: owner.email,
    name: owner.name,
  })

  const cookieStore = await cookies()
  const cookieName = sessionCookieName()
  const secure = cookieSecure()

  // Backup do JWT atual do admin (existir, é o cookie de sessão dele)
  const currentSession = cookieStore.get(cookieName)
  if (currentSession?.value) {
    cookieStore.set({
      name: IMPERSONATION_BACKUP_COOKIE,
      value: currentSession.value,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 horas
    })
  }

  cookieStore.set({
    name: cookieName,
    value: targetToken,
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  })

  cookieStore.set({
    name: IMPERSONATION_FLAG_COOKIE,
    value: encodeImpersonationFlag({
      adminUserId: admin.userId,
      adminName: admin.name ?? admin.email ?? "Admin",
      targetUserId: owner.id,
      targetName: owner.name ?? owner.email ?? tenant.name,
      startedAt: Date.now(),
    }),
    httpOnly: false, // visível ao client para banner
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  })

  return NextResponse.json({ data: { redirect: "/painel" } })
  },
)
