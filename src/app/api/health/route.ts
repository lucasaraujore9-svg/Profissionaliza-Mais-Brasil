import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/redis"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 10

/**
 * Health check para monitoring externo (UptimeRobot, Better Uptime, etc.).
 *
 * Retorna 200 se DB acessível, 503 se DB falha. Redis é informativo (ausente
 * = rate-limit OFF, mas app funciona). Envs essenciais já são validadas
 * no boot via src/instrumentation.ts — não checadas aqui.
 *
 * Não exige auth. Por design: monitoring chama sem token e sem
 * preocupação com cookies. O endpoint é cheap (1 SELECT) e tem rate-limit
 * implícito via CDN/Vercel.
 *
 * Uso típico:
 *   curl https://profissionalizamaisbrasil.com.br/api/health
 *   → { "status": "healthy", "checks": { "database": true, "redis": true } }
 */
export const GET = withRequestContext(
  { action: "health.check", route: "/api/health" },
  async (_request: Request) => {
  const start = Date.now()
  const checks: { database: boolean; redis: boolean | "disabled" } = {
    database: false,
    redis: "disabled",
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = true
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        checks,
        error: err instanceof Error ? err.message : "db error",
        latencyMs: Date.now() - start,
      },
      { status: 503 },
    )
  }

  if (redis) {
    try {
      await redis.ping()
      checks.redis = true
    } catch {
      checks.redis = false
      // Redis fail = warning, não 503 (rate-limit degrada mas app funciona).
    }
  }

  return NextResponse.json({
    status: "healthy",
    checks,
    latencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  })
  },
)
