import { NextResponse } from "next/server"
import { z } from "zod"
import { rateLimit, rateLimitResponse } from "@/lib/ratelimit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"

// OBS-001: beacon de erros do client. As error boundaries (error.tsx,
// global-error.tsx) e o clientLogger.error postam aqui em produção, então o
// stack chega ao log estruturado do servidor (Vercel Runtime Logs) — é o que
// torna verdadeira a mensagem "já fomos notificados" exibida ao usuário.
// Público (não há como o client portar o INTERNAL_SECRET) mas defendido por
// rate-limit + tamanho limitado + redação de PII no logger.
const schema = z.object({
  level: z.enum(["warn", "error"]).default("error"),
  msg: z.string().min(1).max(500),
  url: z.string().max(500).optional(),
  digest: z.string().max(200).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export const POST = withRequestContext(
  { action: "observability.client_log", route: "/api/observability/client-log" },
  async (request: Request) => {
    const rl = await rateLimit(request, {
      name: "client-log",
      limit: 30,
      windowSec: 60,
      failOpen: true,
    })
    if (!rl.ok) return rateLimitResponse(rl)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 })
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const { level, msg, url, digest, context } = parsed.data
    // O logger do servidor redige chaves sensíveis (defesa em profundidade — o
    // client também já sanitiza antes de enviar).
    contextLogger()[level](
      { event: "client.error", clientMsg: msg, clientUrl: url, digest, clientContext: context },
      `client ${level}: ${msg}`,
    )
    return NextResponse.json({ ok: true })
  },
)
