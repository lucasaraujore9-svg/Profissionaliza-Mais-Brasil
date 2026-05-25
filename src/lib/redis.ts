import { Redis } from "@upstash/redis"

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    if (process.env.NODE_ENV !== "production") {
      // Edge-runtime compatível: NÃO importar Pino aqui (esse módulo roda no middleware).
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        level: "warn",
        msg: "Redis disabled — UPSTASH_REDIS_REST_URL/TOKEN ausentes",
        event: "redis.disabled",
        time: new Date().toISOString(),
      }))
    }
    return null
  }

  return new Redis({ url, token })
}

export const redis = createRedisClient()
