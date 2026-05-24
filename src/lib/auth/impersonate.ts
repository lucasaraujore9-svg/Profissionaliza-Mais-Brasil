import { encode, decode } from "next-auth/jwt"
import type { UserRole } from "@prisma/client"
import { authSecret } from "@/lib/env"

const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 dias (igual ao default do NextAuth)

export const IMPERSONATION_BACKUP_COOKIE = "pmb_admin_backup"
export const IMPERSONATION_FLAG_COOKIE = "pmb_impersonation"

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
}

export function sessionCookieName(): string {
  return isProd() ? "__Secure-authjs.session-token" : "authjs.session-token"
}

export function cookieSecure(): boolean {
  return isProd()
}

export interface SessionTokenPayload {
  sub: string
  role: UserRole
  tenantId: string | null
  email?: string | null
  name?: string | null
}

function getSecret(): string {
  const secret = authSecret()
  if (!secret) {
    throw new Error(
      "AUTH_SECRET ausente — impersonation requer secret válido. Configure no .env (openssl rand -hex 32).",
    )
  }
  return secret
}

export async function buildSessionToken(
  payload: SessionTokenPayload,
): Promise<string> {
  return encode({
    token: payload,
    secret: getSecret(),
    salt: sessionCookieName(),
    maxAge: SESSION_MAX_AGE,
  })
}

export async function decodeSessionToken(
  raw: string,
): Promise<SessionTokenPayload | null> {
  const decoded = await decode({
    token: raw,
    secret: getSecret(),
    salt: sessionCookieName(),
  })
  if (!decoded || typeof decoded !== "object") return null
  const t = decoded as Record<string, unknown>
  if (typeof t.sub !== "string" || typeof t.role !== "string") return null
  return {
    sub: t.sub,
    role: t.role as UserRole,
    tenantId: typeof t.tenantId === "string" ? t.tenantId : null,
    email: typeof t.email === "string" ? t.email : null,
    name: typeof t.name === "string" ? t.name : null,
  }
}

export interface ImpersonationFlag {
  adminUserId: string
  adminName: string
  targetUserId: string
  targetName: string
  startedAt: number
}

export function encodeImpersonationFlag(flag: ImpersonationFlag): string {
  return Buffer.from(JSON.stringify(flag)).toString("base64url")
}

export function decodeImpersonationFlag(
  raw: string | undefined | null,
): ImpersonationFlag | null {
  if (!raw) return null
  try {
    const json = Buffer.from(raw, "base64url").toString("utf-8")
    const parsed = JSON.parse(json) as ImpersonationFlag
    if (!parsed.adminUserId || !parsed.targetUserId) return null
    return parsed
  } catch {
    return null
  }
}
