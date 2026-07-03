import {
  getPlacarSnapshotCached as getPlacarSnapshot,
  getActiveTenantsCached as getActiveTenants,
} from "@/lib/placar/snapshot"
import { contextLogger } from "@/lib/logger"

// Stream SSE publico do placar de lancamento. Mantemos os dados no servidor
// (so empurramos agregados + evento "venda nova") — diferente de assinar o
// Supabase Realtime no client, que com a anon key exporia a tabela de tenants.
//
// A cada ~5s o servidor recalcula o snapshot e o reenvia. Quando uma revenda
// nova aparece como ATIVA (que nao estava no tick anterior), emite um evento
// `sale` → o client toca o som de caixa registradora e anima.

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 300

const TICK_MS = 5000
// ~270s de vida por conexao; o EventSource do navegador reconecta sozinho,
// mantendo-nos abaixo do teto de 300s da plataforma.
const MAX_TICKS = 54

export async function GET() {
  const encoder = new TextEncoder()
  let interval: ReturnType<typeof setInterval> | null = null
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
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

      // Estado inicial: snapshot + conjunto de ativas atuais (baseline, para
      // nao disparar "venda" para revendas que ja estavam ativas).
      let activeIds: Set<string>
      try {
        const [snap, active] = await Promise.all([
          getPlacarSnapshot(),
          getActiveTenants(),
        ])
        activeIds = new Set(active.map((t) => t.id))
        send("snapshot", snap)
      } catch (err) {
        // OBS-010: antes era catch mudo — a stream degradava sem rastro.
        contextLogger().warn(
          { err, event: "placar.stream.init_failed", scope: "public" },
          "placar stream: snapshot inicial falhou",
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
            getPlacarSnapshot(),
            getActiveTenants(),
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
            { err, event: "placar.stream.tick_failed", scope: "public", tick: ticks },
            "placar stream: tick falhou",
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
