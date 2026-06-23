import { cookies } from "next/headers"
import type { UserRole } from "@prisma/client"
import {
  buildSessionToken,
  cookieSecure,
  encodeImpersonationFlag,
  IMPERSONATION_BACKUP_COOKIE,
  IMPERSONATION_FLAG_COOKIE,
  sessionCookieName,
} from "@/lib/auth/impersonate"

/**
 * Inicia uma sessão de impersonação: faz backup do JWT atual (do ator), emite e
 * grava o JWT do alvo no cookie de sessão e grava o flag HMAC para o banner. É a
 * mesma mecânica usada para revenda e aluno — centralizada aqui para os 4 fluxos
 * (admin→revenda, admin→aluno, revendedor-vendedor→sub-revenda, revendedor→aluno).
 *
 * Encerramento é genérico em /api/admin/end-impersonation (restaura o backup).
 */
export interface StartImpersonationInput {
  target: {
    sub: string
    role: UserRole
    tenantId: string | null
    studentId?: string | null
    email?: string | null
    name?: string | null
  }
  actor: { userId: string; name?: string | null; email?: string | null }
  /** Rótulo amigável do alvo, exibido no banner "acessando como …". */
  targetLabel: string
}

const EIGHT_HOURS = 60 * 60 * 8

export async function startImpersonation(input: StartImpersonationInput): Promise<void> {
  const targetToken = await buildSessionToken({
    sub: input.target.sub,
    role: input.target.role,
    tenantId: input.target.tenantId,
    studentId: input.target.studentId ?? null,
    email: input.target.email,
    name: input.target.name,
  })

  const cookieStore = await cookies()
  const cookieName = sessionCookieName()
  const secure = cookieSecure()

  // Backup do JWT atual do ator (para o end-impersonation restaurar).
  const current = cookieStore.get(cookieName)
  if (current?.value) {
    cookieStore.set({
      name: IMPERSONATION_BACKUP_COOKIE,
      value: current.value,
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: EIGHT_HOURS,
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
      adminUserId: input.actor.userId,
      adminName: input.actor.name ?? input.actor.email ?? "Você",
      targetUserId: input.target.sub,
      targetName: input.targetLabel,
      startedAt: Date.now(),
    }),
    httpOnly: false, // visível ao client para o banner
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: EIGHT_HOURS,
  })
}
