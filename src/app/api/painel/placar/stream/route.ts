import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  getReferralPlacarSnapshot,
  getReferralActiveTenants,
} from "@/lib/placar/snapshot"

// Stream SSE do placar de INDICAÇÕES, escopado ao revendedor logado: só conta
// as revendas que ELE indicou (Tenant.referrerTenantId = tenantId da sessão).
// Espelha o stream público (/api/placar/stream), mas autenticado e por-tenant —
// nunca expõe dados de outros revendedores.
export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

const TICK_MS = 5000
// ~270s por conexão; o EventSource reconecta sozinho, abaixo do teto de 300s.
const MAX_TICKS = 54

export async function GET() {
  const session = await auth()
  const tenantId = session?.user?.tenantId
  if (!tenantId) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Só revendedor de revenda (módulo ativo) acessa o placar de indicações.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { canSellResellers: true },
  })
  if (!tenant?.canSellResellers) {
    return new Response("Forbidden", { status: 403 })
  }

  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          )
        } catch {
          closed = true
        }
      }

      const finish = () => {
        if (closed) return
        closed = true
        if (interval) clearInterval(interval)
        try {
          controller.close()
        } catch {
          // ja fechado
        }
      }

      // Baseline: ativas atuais (para não disparar "venda" para quem já estava ativa).
      let activeIds: Set<string>
      try {
        const [snap, active] = await Promise.all([
          getReferralPlacarSnapshot(tenantId),
          getReferralActiveTenants(tenantId),
        ])
        activeIds = new Set(active.map((t) => t.id))
        send("snapshot", snap)
      } catch {
        send("error", { message: "init_failed" })
        finish()
        return
      }

      let ticks = 0
      interval = setInterval(async () => {
        if (closed) return
        ticks++
        try {
          const [snap, active] = await Promise.all([
            getReferralPlacarSnapshot(tenantId),
            getReferralActiveTenants(tenantId),
          ])
          send("snapshot", snap)

          for (const t of active) {
            if (!activeIds.has(t.id)) {
              send("sale", { name: t.name, ativos: snap.ativos })
            }
          }
          activeIds = new Set(active.map((t) => t.id))
        } catch {
          // tick falhou (banco momentaneamente indisponível) — ignora e segue
        }

        if (ticks >= MAX_TICKS) finish()
      }, TICK_MS)
    },
    cancel() {
      closed = true
      if (interval) clearInterval(interval)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
