import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { isVercelConfigured } from "@/lib/vercel/client"
import {
  ensureCustomDomainCert,
  type EnsureCertResult,
} from "@/lib/vercel/ensure-cert"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Reconciliacao diaria de certificados TLS dos dominios proprios.
 *
 * A Vercel so emite o cert sozinha quando o DNS ja aponta no momento do anexo
 * do dominio; quando o revendedor aponta DEPOIS, a emissao pode nunca ocorrer
 * (incidente vanguardacursos: 25 dias anexado sem cert → https morto). Este
 * cron varre todos os tenants com customDomain e, por variante (apex + www),
 * emite o cert que falta assim que o DNS estiver apontado.
 *
 * Idempotente: variante com cert existente e no-op. Disparado via
 * `app_internal.run_cron('/api/cron/ensure-domain-certs')` (pg_cron).
 * Auth: Bearer CRON_SECRET (padrao dos demais crons).
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  if (!isVercelConfigured()) {
    return NextResponse.json(
      { error: "Vercel API não configurada (VERCEL_TOKEN/VERCEL_PROJECT_ID)" },
      { status: 503 },
    )
  }

  const tenants = await prisma.tenant.findMany({
    where: { customDomain: { not: null } },
    select: { slug: true, customDomain: true },
    orderBy: { slug: "asc" },
  })

  const tally = { scanned: 0, ok: 0, issued: 0, dns_pending: 0, failed: 0 }
  const results: Array<EnsureCertResult & { slug: string }> = []
  const CONCURRENCY = 3

  async function processOne(t: (typeof tenants)[number]): Promise<void> {
    if (!t.customDomain) return
    tally.scanned++
    const result = await ensureCustomDomainCert(t.customDomain)
    tally[result.outcome]++
    // "ok" (ja tinha cert) fica fora do detalhe — so o que exige atencao.
    if (result.outcome !== "ok") results.push({ slug: t.slug, ...result })
  }

  for (let i = 0; i < tenants.length; i += CONCURRENCY) {
    await Promise.all(tenants.slice(i, i + CONCURRENCY).map(processOne))
  }

  contextLogger().info(
    { event: "cron.ensure_domain_certs", ...tally },
    "reconciliação de certs de domínio próprio concluída",
  )
  return NextResponse.json({ data: { tally, results } })
}

export async function GET(request: Request) {
  return POST(request)
}
