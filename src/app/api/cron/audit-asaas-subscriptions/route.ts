import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { listSubscriptions } from "@/lib/asaas/client"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * AUDITORIA READ-ONLY: lista as assinaturas Asaas de cada unidade e grava em
 * public._pmb_sub_audit quais clientes têm mais de uma assinatura ATIVA (sinal
 * de cobrança duplicada por recriação). NÃO cancela nada. Tabela de scratch lida
 * fora de banda; criada via Management API antes de rodar.
 */
async function run() {
  const tenants = await prisma.tenant.findMany({
    where: {
      slug: { not: PMB_TENANT_SLUG },
      asaasCustomerId: { not: null },
    },
    select: {
      slug: true,
      asaasCustomerId: true,
      asaasSubscriptionId: true,
    },
  })

  const result = { tenants: tenants.length, withDuplicates: 0, errors: [] as string[] }

  for (const tenant of tenants) {
    try {
      const subs = await listSubscriptions({
        customer: tenant.asaasCustomerId!,
        limit: 100,
      })
      // Status ativos no Asaas: ACTIVE (a subscription gera cobranças). INACTIVE
      // = encerrada/cancelada. Contamos as que ainda cobram.
      const active = subs.data.filter((s) => s.status === "ACTIVE")
      if (active.length <= 1) continue

      result.withDuplicates += 1
      const activeJson = active.map((s) => ({
        id: s.id,
        value: s.value,
        nextDueDate: s.nextDueDate,
        status: s.status,
        canonical: s.id === tenant.asaasSubscriptionId,
      }))
      await prisma.$executeRaw`
        insert into public._pmb_sub_audit (slug, customer_id, canonical_sub, active_count, active_subs)
        values (${tenant.slug}, ${tenant.asaasCustomerId}, ${tenant.asaasSubscriptionId}, ${active.length}, ${JSON.stringify(activeJson)}::jsonb)
      `
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`${tenant.slug}: ${msg}`)
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await run()
  contextLogger().info(
    { event: "cron.audit_asaas_subscriptions", ...result },
    "auditoria de assinaturas Asaas concluída",
  )
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
