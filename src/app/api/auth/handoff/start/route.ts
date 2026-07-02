import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  createHandoffToken,
  isSafeInternalPath,
  tenantTargetOrigin,
} from "@/lib/auth/handoff"
import { contextLogger } from "@/lib/logger"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Inicia o handoff cross-domain: roda no dominio PMB, com a revenda JA
 * autenticada. Gera um token de uso unico e redireciona o browser para a URL
 * da unidade (`/api/auth/handoff?token=...`), onde a sessao sera re-emitida.
 *
 * Fallbacks (graciosos):
 *   - nao e revenda / sem tenant → manda pro destino interno mesmo (no PMB).
 *   - tenant inexistente         → idem.
 *   - Redis indisponivel         → /login da unidade (revenda loga de novo).
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const user = session?.user

  const nextParam = req.nextUrl.searchParams.get("next")
  const next = isSafeInternalPath(nextParam) ? nextParam : "/painel"

  if (!user || user.role !== "RESELLER" || !user.tenantId) {
    // Sem contexto de revenda — segue no proprio dominio.
    return NextResponse.redirect(new URL(next, req.url))
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: { slug: true, customDomain: true, domainVerified: true },
  })
  if (!tenant) {
    return NextResponse.redirect(new URL(next, req.url))
  }

  const origin = tenantTargetOrigin(tenant)
  const token = await createHandoffToken(user.id as string)

  if (!token) {
    // Sem Redis: nao da pra emitir sessao com seguranca cross-domain. Manda
    // a revenda pro proprio /login (ja na marca/dominio dela).
    contextLogger().warn(
      { event: "auth.handoff.no_redis", tenantSlug: tenant.slug },
      "handoff sem Redis — fallback para /login da unidade",
    )
    return NextResponse.redirect(`${origin}/login`)
  }

  const target = new URL(`${origin}/api/auth/handoff`)
  target.searchParams.set("token", token)
  target.searchParams.set("next", next)
  return NextResponse.redirect(target.toString())
}
