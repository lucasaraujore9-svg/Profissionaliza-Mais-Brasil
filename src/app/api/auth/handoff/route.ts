import { NextResponse, type NextRequest } from "next/server"
import {
  consumeHandoffToken,
  encodeSessionJwt,
  isSafeInternalPath,
  resolveResellerClaims,
} from "@/lib/auth/handoff"
import { sessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth/cookies"
import { contextLogger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Recebe o handoff cross-domain: roda no dominio da unidade. Valida o token de
 * uso unico, reconstroi os claims do revendedor, re-emite o JWT de sessao do
 * NextAuth e grava o cookie escopado neste host. Depois redireciona ao painel.
 *
 * Qualquer falha (token ausente/expirado/invalido, usuario nao elegivel) cai
 * no /login local — a revenda apenas autentica de novo, ja no dominio dela.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  const nextParam = req.nextUrl.searchParams.get("next")
  const next = isSafeInternalPath(nextParam) ? nextParam : "/painel"

  const fallback = () =>
    NextResponse.redirect(new URL("/login?callbackUrl=" + encodeURIComponent(next), req.url))

  if (!token) return fallback()

  const userId = await consumeHandoffToken(token)
  if (!userId) return fallback()

  const claims = await resolveResellerClaims(userId)
  if (!claims) return fallback()

  let jwt: string
  try {
    jwt = await encodeSessionJwt(claims)
  } catch (error) {
    contextLogger().error(
      { err: error, event: "auth.handoff.encode_failed", userId },
      "handoff: falha ao emitir sessão",
    )
    return fallback()
  }

  const res = NextResponse.redirect(new URL(next, req.url))
  res.cookies.set(SESSION_COOKIE_NAME, jwt, sessionCookieOptions)

  contextLogger().info(
    {
      event: "audit.auth.handoff",
      userId,
      tenantId: claims.tenantId,
      memberRole: claims.memberRole,
    },
    "auth: handoff cross-domain concluído",
  )

  return res
}
