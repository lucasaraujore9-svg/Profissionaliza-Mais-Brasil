import { redis } from "@/lib/redis"

const KEY = "catalog:sync-log"
const MAX_ENTRIES = 30

export interface SyncLogEntry {
  id: string
  at: string
  status: "SUCCESS" | "FAILURE"
  added: number
  updated: number
  totalInEa: number
  message: string
  source: "manual" | "cron"
  durationMs: number
}

export async function pushSyncLog(entry: SyncLogEntry): Promise<void> {
  if (!redis) return
  await redis.lpush(KEY, JSON.stringify(entry))
  await redis.ltrim(KEY, 0, MAX_ENTRIES - 1)
}

export async function listSyncLogs(): Promise<SyncLogEntry[]> {
  if (!redis) return []
  const raw = await redis.lrange(KEY, 0, MAX_ENTRIES - 1)
  const out: SyncLogEntry[] = []
  for (const item of raw) {
    try {
      const parsed =
        typeof item === "string" ? (JSON.parse(item) as SyncLogEntry) : (item as SyncLogEntry)
      out.push(parsed)
    } catch {
      // ignore malformed entries
    }
  }
  return out
}

export async function getLastSuccessfulSync(): Promise<SyncLogEntry | null> {
  const logs = await listSyncLogs()
  return logs.find((l) => l.status === "SUCCESS") ?? null
}
