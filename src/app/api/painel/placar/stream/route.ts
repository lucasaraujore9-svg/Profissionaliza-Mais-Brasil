import { requirePainel } from "@/lib/auth/painel-guard"
import { prisma } from "@/lib/prisma"
import {
  getReferralPlacarSnapshotCached as getReferralPlacarSnapshot,
  getReferralActiveTenantsCached as getReferralActiveTenants,
} from "@/lib/placar/snapshot"
import { contextLogger } from "@/lib/logger"

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
  // O placar é o scoreboard das revendas indicadas — mesma permissão da seção
  // "Revendedor" no menu, e não apenas "estar logado na unidade".
  const guard = await requirePainel("revendas.view")
  if (!guard.ok) return guard.response
  const tenantId = guard.ctx.tenantId

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
      } catch (err) {
        // OBS-010: antes era catch mudo — a stream degradava sem rastro.
        contextLogger().warn(
          { err, event: "placar.stream.init_failed", scope: "painel", tenantId },
          "placar stream (painel): snapshot inicial falhou",
        )
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
        } catch (err) {
          // Degrada graciosamente (o EventSource reconecta), mas deixa rastro —
          // se a falha for persistente o placar "trava" sem isto (OBS-010).
          contextLogger().warn(
            { err, event: "placar.stream.tick_failed", scope: "painel", tenantId, tick: ticks },
            "placar stream (painel): tick falhou",
          )
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
