import { redis } from "@/lib/redis"
import { prisma } from "@/lib/prisma"

const KEY = "catalog:sync-log"
const MAX_ENTRIES = 30
const SETTINGS_ID = "default"

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
  // Redis: histórico completo (opcional)
  if (redis) {
    await redis.lpush(KEY, JSON.stringify(entry))
    await redis.ltrim(KEY, 0, MAX_ENTRIES - 1)
  }
  // DB: persiste sempre o último sync bem-sucedido (fallback sem Redis)
  if (entry.status === "SUCCESS") {
    await prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { lastCatalogSyncJson: JSON.stringify(entry) },
      create: { id: SETTINGS_ID, lastCatalogSyncJson: JSON.stringify(entry) },
    })
  }
}

export async function listSyncLogs(): Promise<SyncLogEntry[]> {
  if (!redis) return []
  let raw: unknown[]
  try {
    raw = await redis.lrange(KEY, 0, MAX_ENTRIES - 1)
  } catch {
    // Redis indisponivel (timeout/auth) — degrada para vazio em vez de
    // propagar o erro e derrubar quem consome (ex.: listagem do catalogo).
    return []
  }
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
  // 1. Tenta Redis (histórico completo) — falha de cache nunca pode derrubar
  // o consumidor; cai pro fallback de DB abaixo.
  if (redis) {
    try {
      const logs = await listSyncLogs()
      const fromRedis = logs.find((l) => l.status === "SUCCESS") ?? null
      if (fromRedis) return fromRedis
    } catch {
      // segue para o fallback de DB
    }
  }
  // 2. Fallback: DB (sempre disponível)
  try {
    const row = await prisma.systemSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { lastCatalogSyncJson: true },
    })
    if (!row?.lastCatalogSyncJson) return null
    return JSON.parse(row.lastCatalogSyncJson) as SyncLogEntry
  } catch {
    return null
  }
}
