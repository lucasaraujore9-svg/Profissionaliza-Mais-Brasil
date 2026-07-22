import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { sweepAbandonedLeadsForContext } from "@/lib/automation/leads"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Sweep periodico (a cada 2h via vercel.json) que move StudentLeads
 * CHECKOUT_STARTED para ABANDONED quando ultrapassam a janela configurada
 * sem pagamento aprovado.
 *
 * Cobre tanto tenants (Tenant.abandonedAfterHours) quanto a vitrine PMB
 * (SystemSettings.pmbAbandonedAfterHours).
 *
 * Dispara o template CHECKOUT_ABANDONED como mensagem de recovery.
 */
async function process() {
  const result = {
    tenantsScanned: 0,
    pmbScanned: false,
    leadsSwept: 0,
    errors: [] as string[],
  }

  // -------- Revendedores com automacao habilitada --------
  const tenants = await prisma.tenant.findMany({
    where: { automationEnabled: true },
    select: { id: true, slug: true, abandonedAfterHours: true },
  })
  result.tenantsScanned = tenants.length

  for (const tenant of tenants) {
    try {
      const { swept } = await sweepAbandonedLeadsForContext(
        tenant.id,
        tenant.abandonedAfterHours,
      )
      result.leadsSwept += swept
    } catch (err) {
      const msg = err instanceof Error ? err.message : "erro desconhecido"
      result.errors.push(`tenant ${tenant.slug}: ${msg}`)
      contextLogger().error(
        { err, event: "cron.sweep_abandoned_leads.tenant_failed", tenantId: tenant.id },
        "Falha ao varrer leads abandonados (tenant)",
      )
    }
  }

  // -------- Sistema mae (vitrine PMB) --------
  try {
    const settings = await prisma.systemSettings.upsert({
      where: { id: "default" },
      create: { id: "default" },
      update: {},
      select: { pmbAutomationEnabled: true, pmbAbandonedAfterHours: true },
    })
    if (settings.pmbAutomationEnabled) {
      result.pmbScanned = true
      const { swept } = await sweepAbandonedLeadsForContext(
        null,
        settings.pmbAbandonedAfterHours,
      )
      result.leadsSwept += swept
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "erro desconhecido"
    result.errors.push(`pmb: ${msg}`)
    contextLogger().error(
      { err, event: "cron.sweep_abandoned_leads.pmb_failed" },
      "Falha ao varrer leads abandonados (PMB)",
    )
  }

  return result
}

export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await process()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
