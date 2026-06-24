import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { putLmsTenantBranding, isLmsConfigured } from "@/lib/lms"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Backfill de branding white-label: registra no LMS (PUT /api/v1/tenants/:id) o
 * nome + logo de TODAS as revendas existentes (exceto a vitrine PMB `__pmb__`).
 * Cobre o retroativo — o disparo automático (criação/edição de revenda) só pega
 * as novas/alteradas.
 *
 * Roda no runtime de produção (onde LMS_API_* existe — são "Sensitive" na Vercel
 * e não baixam local). Disparado via `app_internal.run_cron('/api/cron/...')`.
 *
 * Auth: Bearer CRON_SECRET. Dry-run por padrão; `?write=1` aplica.
 */
interface Outcome {
  tenantId: string
  slug: string
  status: "pending" | "updated" | "failed"
}

async function run(opts: { write: boolean; limit: number }) {
  if (!isLmsConfigured()) {
    return {
      configured: false,
      write: opts.write,
      tally: { scanned: 0, updated: 0, failed: 0 },
      details: [] as Outcome[],
    }
  }

  const tenants = await prisma.tenant.findMany({
    where: { slug: { not: PMB_TENANT_SLUG } },
    select: { id: true, slug: true, name: true, logoUrl: true },
    take: opts.limit,
  })

  const tally = { scanned: tenants.length, updated: 0, failed: 0 }
  const details: Outcome[] = []
  const CONCURRENCY = 5

  async function processOne(t: (typeof tenants)[number]): Promise<void> {
    if (!opts.write) {
      details.push({ tenantId: t.id, slug: t.slug, status: "pending" })
      return
    }
    try {
      await putLmsTenantBranding(t.id, { brandName: t.name, logoUrl: t.logoUrl })
      tally.updated++
      details.push({ tenantId: t.id, slug: t.slug, status: "updated" })
    } catch (err) {
      tally.failed++
      details.push({ tenantId: t.id, slug: t.slug, status: "failed" })
      contextLogger().warn(
        { err, event: "cron.sync_lms_branding.failed", tenantId: t.id },
        "backfill de branding LMS falhou para o tenant",
      )
    }
  }

  for (let i = 0; i < tenants.length; i += CONCURRENCY) {
    await Promise.all(tenants.slice(i, i + CONCURRENCY).map(processOne))
  }

  contextLogger().info(
    { event: "cron.sync_lms_branding", write: opts.write, ...tally },
    "backfill de branding LMS concluído",
  )
  return { configured: true, write: opts.write, tally, details }
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(request.url)
  const write = url.searchParams.get("write") === "1"
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 2000) || 2000, 10000)

  const result = await run({ write, limit })
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
