import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { reconcileTenantPayments } from "@/lib/asaas/reconcile"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Reconcilia em massa as mensalidades (TenantPayment) de todas as unidades
 * contra a conta Asaas global da PMB, marcando DELETED as cobranças órfãs
 * (PENDING/OVERDUE/DELETING que não existem mais no Asaas). É o varredor que
 * limpa de uma vez o acúmulo de cobranças repetidas geradas por recriações de
 * assinatura — o mesmo que a reconciliação inline do detalhe faz por unidade.
 *
 * Idempotente: rodar de novo não tem efeito além de reconfirmar. Sequencial de
 * propósito (uma chamada Asaas por unidade) para não estourar rate limit.
 */
async function run() {
  const tenants = await prisma.tenant.findMany({
    where: {
      slug: { not: PMB_TENANT_SLUG },
      OR: [
        { asaasCustomerId: { not: null } },
        { asaasSubscriptionId: { not: null } },
      ],
    },
    select: {
      id: true,
      slug: true,
      asaasCustomerId: true,
      asaasSubscriptionId: true,
    },
  })

  const result = {
    tenants: tenants.length,
    markedDeleted: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (const tenant of tenants) {
    try {
      const r = await reconcileTenantPayments(tenant)
      result.markedDeleted += r.markedDeleted
      if (r.skipped) result.skipped += 1
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
    { event: "cron.reconcile_tenant_payments", ...result },
    "reconciliação de mensalidades concluída",
  )
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
