import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Pool config explícito — Supabase Pooler tem teto de 60 conexões por
  // instância no plano free e o Vercel pode ter várias instâncias quentes
  // ao mesmo tempo. Sem `max`, o default do `pg` é 10; com tráfego maior
  // pode estourar. `idleTimeoutMillis` libera conexões ociosas; `connectionTimeoutMillis`
  // evita requests pendurados quando o banco está saturado.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
  const adapter = new PrismaPg(pool)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query"] : [],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
