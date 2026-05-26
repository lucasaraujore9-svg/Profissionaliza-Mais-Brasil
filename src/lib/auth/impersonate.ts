import { encode, decode } from "next-auth/jwt"
import { createHmac, timingSafeEqual } from "node:crypto"
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

/**
 * Codifica o flag com HMAC SHA-256 para impedir forjamento via XSS/cookie
 * injection. Formato: `<base64url(json)>.<base64url(hmac)>`. O endpoint
 * `end-impersonation` exige assinatura válida antes de restaurar a sessão
 * de admin — antes o cookie era base64 puro e qualquer atacante que
 * pudesse setar `pmb_impersonation` + `pmb_admin_backup` ganhava acesso ao
 * JWT salvo (escalation a partir de XSS/sub-domain takeover).
 */
function hmacSign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url")
}

function hmacVerify(data: string, sig: string): boolean {
  const expected = hmacSign(data)
  const a = Buffer.from(expected)
  const b = Buffer.from(sig)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function encodeImpersonationFlag(flag: ImpersonationFlag): string {
  const payload = Buffer.from(JSON.stringify(flag)).toString("base64url")
  const sig = hmacSign(payload)
  return `${payload}.${sig}`
}

export function decodeImpersonationFlag(
  raw: string | undefined | null,
): ImpersonationFlag | null {
  if (!raw) return null
  try {
    const [payload, sig] = raw.split(".")
    if (!payload || !sig) return null
    if (!hmacVerify(payload, sig)) return null
    const json = Buffer.from(payload, "base64url").toString("utf-8")
    const parsed = JSON.parse(json) as ImpersonationFlag
    if (!parsed.adminUserId || !parsed.targetUserId) return null
    return parsed
  } catch {
    return null
  }
}
