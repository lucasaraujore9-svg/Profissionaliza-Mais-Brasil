import { Redis } from "@upstash/redis"

function createRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[redis] UPSTASH_REDIS_REST_URL or TOKEN not set — Redis disabled")
      return null
    }
    throw new Error("UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required")
  }

  return new Redis({ url, token })
}

export const redis = createRedisClient()
