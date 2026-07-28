// SSO cross-domain para revendedores.
//
// Problema: cookies de sessao sao isolados por dominio (PMB e
// {slug}.livrecursos.com.br / dominio-custom nao compartilham cookie). Quando
// uma revenda loga no site PMB, queremos manda-la para a URL da propria
// unidade JA AUTENTICADA.
//
// Solucao: token de uso unico (nonce em Redis, TTL curto). O dominio PMB,
// com a revenda ja autenticada, gera o token e redireciona o browser para
// `https://{unidade}/api/auth/handoff?token=...`. Esse endpoint (rodando no
// contexto do dominio da unidade) valida o token, re-emite o MESMO JWT de
// sessao do NextAuth (mesmo AUTH_SECRET) e grava o cookie escopado naquele
// host. Resultado: sessao valida no dominio da unidade.
//
// Seguranca: o token so e gerado para uma revenda ja autenticada; e
// aleatorio (32 bytes), de uso unico (GETDEL atomico) e expira em 60s. O
// claims da sessao e SEMPRE reconstruido a partir do proprio usuario, entao o
// portador do token so consegue a propria sessao.

import { randomBytes } from "node:crypto"
import { encode } from "next-auth/jwt"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { authSecret } from "@/lib/env"
import { activeCustomDomain, vitrineHost } from "@/lib/tenant/urls"
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from "@/lib/auth/cookies"
import {
  normalizeMemberRole,
  type PainelMemberRole,
} from "@/lib/auth/painel-permissions"

const HANDOFF_PREFIX = "auth:handoff:"
const HANDOFF_TTL_SECONDS = 60

export interface ResellerSessionClaims {
  sub: string
  name?: string | null
  email?: string | null
  role: "RESELLER"
  tenantId: string
  studentId: null
  mustChangePassword: boolean
  tenantStatus: string | null
  memberRole: PainelMemberRole | null
}

// Origem (https://host) do dominio da unidade. Usa o dominio custom apenas
// quando ele ja esta APLICADO (DNS apontado + verificado); caso contrario o
// subdominio em livrecursos.com.br. Redirecionar o SSO para um dominio proprio
// ainda pendente levaria a revenda a um endereco que nao resolve.
export function tenantTargetOrigin(tenant: {
  slug: string
  customDomain?: string | null
  domainVerified?: boolean | null
}): string {
  const host = activeCustomDomain(tenant) ?? vitrineHost(tenant.slug)
  return `https://${host}`
}

// Aceita apenas paths internos (mesma protecao anti open-redirect do login).
export function isSafeInternalPath(
  path: string | null | undefined,
): path is string {
  return (
    !!path &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\")
  )
}

// Gera o token de uso unico. Retorna null se o Redis nao estiver disponivel —
// o chamador faz fallback para o /login da unidade (revenda loga de novo, ja
// no proprio dominio).
export async function createHandoffToken(
  userId: string,
): Promise<string | null> {
  if (!redis) return null
  const token = randomBytes(32).toString("base64url")
  try {
    await redis.set(`${HANDOFF_PREFIX}${token}`, userId, {
      ex: HANDOFF_TTL_SECONDS,
    })
    return token
  } catch {
    return null
  }
}

// Consome o token (GETDEL — atomico, uso unico). Retorna o userId ou null.
export async function consumeHandoffToken(
  token: string,
): Promise<string | null> {
  if (!redis) return null
  // Sanidade: o token que emitimos e base64url de 32 bytes (~43 chars).
  // Rejeita lixo antes de tocar o Redis.
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null
  try {
    const userId = await redis.getdel<string>(`${HANDOFF_PREFIX}${token}`)
    return typeof userId === "string" && userId.length > 0 ? userId : null
  } catch {
    return null
  }
}

// Reconstroi os claims de sessao do revendedor a partir do userId — espelha a
// logica do authorize() em src/lib/auth.ts (inclusive consultor via
// TenantMember). Retorna null se o usuario nao for um revendedor elegivel.
export async function resolveResellerClaims(
  userId: string,
): Promise<ResellerSessionClaims | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  })
  if (!user || user.role !== "RESELLER" || user.status !== "ATIVO") return null

  let effectiveTenantId = user.tenantId
  let effectiveTenantStatus = user.tenant?.status ?? null
  let memberRole: PainelMemberRole | null = user.tenantId ? "owner" : null

  if (!effectiveTenantId) {
    const membership = await prisma.tenantMember.findFirst({
      where: { userId: user.id, status: "ATIVO" },
      include: { tenant: { select: { id: true, status: true } } },
      orderBy: { createdAt: "asc" },
    })
    if (membership?.tenant) {
      effectiveTenantId = membership.tenant.id
      effectiveTenantStatus = membership.tenant.status
      memberRole = normalizeMemberRole(membership.role)
    }
  }

  if (!effectiveTenantId) return null
  if (
    effectiveTenantStatus !== "ACTIVE" &&
    effectiveTenantStatus !== "PENDING"
  ) {
    return null
  }

  return {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: "RESELLER",
    tenantId: effectiveTenantId,
    studentId: null,
    mustChangePassword: user.mustChangePassword,
    tenantStatus: effectiveTenantStatus,
    memberRole,
  }
}

// Codifica o JWT de sessao do NextAuth (JWE). O `salt` DEVE ser o nome do
// cookie de sessao (convencao do Auth.js v5), senao o decode no resto do app
// falha.
export async function encodeSessionJwt(
  claims: ResellerSessionClaims,
): Promise<string> {
  const secret = authSecret()
  if (!secret) {
    throw new Error("authSecret ausente — não é possível emitir sessão")
  }
  return encode({
    token: claims,
    secret,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE,
  })
}
