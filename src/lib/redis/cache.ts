import { TENANT_CACHE_TTL_SECONDS } from "./keys"
import { RedisError } from "./errors"

/**
 * Cliente Upstash REST compatível com Edge Runtime.
 * Não usa TCP — usa apenas fetch() sobre HTTPS.
 */
function getUpstashConfig(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url: url.replace(/\/$/, ""), token }
}

async function upstashRequest<T>(
  command: string[],
  operation: string,
): Promise<T | null> {
  const config = getUpstashConfig()
  if (!config) {
    if (process.env.NODE_ENV === "development") {
      // Edge-runtime compatível: NÃO importar Pino (roda no middleware).
      // eslint-disable-next-line no-console
      console.warn(JSON.stringify({
        level: "warn",
        msg: "redis-cache: Redis not configured — skipping operation",
        event: "redis.cache.skip",
        operation,
        time: new Date().toISOString(),
      }))
    }
    return null
  }

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    })

    if (!res.ok) {
      throw new RedisError(
        `Upstash HTTP ${res.status}`,
        operation,
      )
    }

    const data = (await res.json()) as { result: T }
    return data.result ?? null
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error(JSON.stringify({
        level: "error",
        msg: `redis-cache: ${operation} failed`,
        event: "redis.cache.failed",
        operation,
        error: error instanceof Error ? { type: error.name, message: error.message } : String(error),
        time: new Date().toISOString(),
      }))
    }
    throw new RedisError(`Redis ${operation} failed`, operation, error)
  }
}

/**
 * Set com TTL em segundos.
 */
export async function set(
  key: string,
  value: string,
  ttlSeconds: number = TENANT_CACHE_TTL_SECONDS,
): Promise<void> {
  try {
    await upstashRequest<string>(["SET", key, value, "EX", String(ttlSeconds)], "set")
  } catch {
    // Swallow to enable graceful fallback to DB
  }
}

/**
 * Get string value or null.
 */
export async function get(key: string): Promise<string | null> {
  try {
    return await upstashRequest<string>(["GET", key], "get")
  } catch {
    return null
  }
}

/**
 * Invalida uma chave.
 */
export async function invalidate(key: string): Promise<void> {
  try {
    await upstashRequest<number>(["DEL", key], "invalidate")
  } catch {
    // Swallow — cache fails open
  }
}

/**
 * Invalida múltiplas chaves atomicamente.
 */
export async function invalidateMany(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await upstashRequest<number>(["DEL", ...keys], "invalidateMany")
  } catch {
    // Swallow
  }
}

/**
 * Helper genérico: get → parse JSON → null on miss or error.
 */
export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await get(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * Helper genérico: JSON stringify → set.
 */
export async function setJson<T>(
  key: string,
  value: T,
  ttlSeconds: number = TENANT_CACHE_TTL_SECONDS,
): Promise<void> {
  await set(key, JSON.stringify(value), ttlSeconds)
}
