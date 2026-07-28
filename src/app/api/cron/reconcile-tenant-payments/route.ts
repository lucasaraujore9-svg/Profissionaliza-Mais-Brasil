import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { reconcileTenantPayments } from "@/lib/asaas/reconcile"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { contextLogger } from "@/lib/logger"
import { get as redisGet, set as redisSet, invalidate as redisDel } from "@/lib/redis/cache"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// PERF-005: teto de unidades por execução (1 chamada Asaas serial por unidade —
// sequencial de propósito p/ não estourar o rate limit do Asaas). Cursor keyset
// por `id` guardado no Redis: cada execução retoma de onde parou e, ao varrer a
// última página, zera o cursor p/ recomeçar. Fail-open (Redis off): cursor null
// => começa do início (idempotente — reconciliar de novo é inócuo).
const RECONCILE_BATCH = 300
const CURSOR_KEY = "cron:reconcile-tenant-payments:cursor"

/**
 * Reconcilia em massa as mensalidades (TenantPayment) de todas as unidades
 * contra a conta Asaas global da PMB, marcando DELETED as cobranças órfãs
 * (PENDING/OVERDUE/DELETING que não existem mais no Asaas). É o varredor que
 * limpa de uma vez o acúmulo de cobranças repetidas geradas por recriações de
 * assinatura — o mesmo que a reconciliação inline do detalhe faz por unidade.
 *
 * Idempotente: rodar de novo não tem efeito além de reconfirmar. Sequencial de
 * propósito (uma chamada Asaas por unidade) para não estourar rate limit; capado
 * por RECONCILE_BATCH com cursor keyset no Redis para progresso garantido.
 */
async function run() {
  const cursor = (await redisGet(CURSOR_KEY)) || undefined

  const tenants = await prisma.tenant.findMany({
    where: {
      slug: { not: PMB_TENANT_SLUG },
      OR: [
        { asaasCustomerId: { not: null } },
        { asaasSubscriptionId: { not: null } },
      ],
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: RECONCILE_BATCH,
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
    imported: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (const tenant of tenants) {
    try {
      const r = await reconcileTenantPayments(tenant)
      result.markedDeleted += r.markedDeleted
      result.imported += r.imported ?? 0
      if (r.skipped) result.skipped += 1
    } catch (error) {
      const msg = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`${tenant.slug}: ${msg}`)
    }
  }

  // Avança/zera o cursor. Página cheia => continua na próxima execução; página
  // parcial (fim da lista) => zera para recomeçar do início. Best-effort.
  if (tenants.length === RECONCILE_BATCH) {
    await redisSet(CURSOR_KEY, tenants[tenants.length - 1].id, 7 * 24 * 60 * 60)
  } else {
    await redisDel(CURSOR_KEY)
  }

  return result
}

export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
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
