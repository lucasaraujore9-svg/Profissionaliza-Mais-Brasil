import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { sweepAbandonedLeadsForTenant } from "@/lib/automation/leads"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Sweep periodico (a cada 2h via vercel.json) que move StudentLeads
 * CHECKOUT_STARTED para ABANDONED quando ultrapassam a janela configurada
 * em Tenant.abandonedAfterHours sem pagamento aprovado.
 *
 * Dispara o template CHECKOUT_ABANDONED como mensagem de recovery.
 */
async function process() {
  const tenants = await prisma.tenant.findMany({
    where: { automationEnabled: true },
    select: { id: true, slug: true, abandonedAfterHours: true },
  })

  const result = {
    tenantsScanned: tenants.length,
    leadsSwept: 0,
    errors: [] as string[],
  }

  for (const tenant of tenants) {
    try {
      const { swept } = await sweepAbandonedLeadsForTenant(
        tenant.id,
        tenant.abandonedAfterHours,
      )
      result.leadsSwept += swept
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido"
      result.errors.push(`tenant ${tenant.slug}: ${msg}`)
      contextLogger().error(
        { err, event: "cron.sweep_abandoned_leads.tenant_failed", tenantId: tenant.id },
        "Falha ao varrer leads abandonados",
      )
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await process()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
