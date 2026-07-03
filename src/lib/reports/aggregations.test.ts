import { describe, it, expect, vi, beforeEach } from "vitest"

// QA-014: tenant-scoping das agregações de BI. `tenantCondition` monta o filtro
// de tenant no SQL cru (âncora de isolamento P0 do painel). Aqui inspecionamos
// os ARGUMENTOS passados ao Prisma para provar que:
//  - tenantId presente → `AND tenant_id = $N` + arg com o id;
//  - segment=pmb → `AND tenant_id IS NULL`;
//  - segment=revenda → `AND tenant_id IS NOT NULL`;
//  - sem tenantId nem segment → sem cláusula de tenant (visão admin "todos");
//  - bucket fora da whitelist → rejeitado (anti-injeção);
//  - `approvedRevenueTotal` monta o `where.tenantId` correto em cada caso.

vi.mock("@/lib/prisma", () => {
  const prisma = {
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
  }
  return { prisma }
})

import { prisma } from "@/lib/prisma"
import {
  approvedRevenueByBucket,
  approvedRevenueTotal,
} from "./aggregations"

const p = prisma as unknown as {
  $queryRawUnsafe: ReturnType<typeof vi.fn>
  payment: { aggregate: ReturnType<typeof vi.fn> }
}

const start = new Date("2026-01-01T00:00:00.000Z")
const end = new Date("2026-02-01T00:00:00.000Z")

// Recupera (sql, ...args) da última chamada de $queryRawUnsafe.
function lastQuery(): { sql: string; args: unknown[] } {
  const call = p.$queryRawUnsafe.mock.calls.at(-1)!
  const [sql, ...args] = call as [string, ...unknown[]]
  return { sql, args }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.$queryRawUnsafe.mockResolvedValue([])
  p.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
})

describe("aggregations — tenantCondition no SQL cru (QA-014)", () => {
  it("tenantId presente → AND tenant_id = $N com o id nos args", async () => {
    await approvedRevenueByBucket({ start, end, bucket: "day", tenantId: "t_x" })
    const { sql, args } = lastQuery()
    // bucket, start, end, tenantId → o 4º parâmetro.
    expect(sql).toContain("AND tenant_id = $4")
    expect(args).toEqual(["day", start, end, "t_x"])
  })

  it("segment=pmb (sem tenantId) → AND tenant_id IS NULL, sem arg extra", async () => {
    await approvedRevenueByBucket({ start, end, bucket: "day", segment: "pmb" })
    const { sql, args } = lastQuery()
    expect(sql).toContain("AND tenant_id IS NULL")
    expect(sql).not.toContain("tenant_id = $")
    expect(args).toEqual(["day", start, end])
  })

  it("segment=revenda → AND tenant_id IS NOT NULL", async () => {
    await approvedRevenueByBucket({ start, end, bucket: "week", segment: "revenda" })
    const { sql } = lastQuery()
    expect(sql).toContain("AND tenant_id IS NOT NULL")
  })

  it("sem tenantId nem segment → sem cláusula de tenant (visão 'todos')", async () => {
    await approvedRevenueByBucket({ start, end, bucket: "month" })
    const { sql, args } = lastQuery()
    expect(sql).not.toContain("tenant_id")
    expect(args).toEqual(["month", start, end])
  })

  it("tenantId tem precedência sobre segment (id vence o segmento pedido)", async () => {
    await approvedRevenueByBucket({ start, end, bucket: "day", tenantId: "t_y", segment: "pmb" })
    const { sql, args } = lastQuery()
    expect(sql).toContain("AND tenant_id = $4")
    expect(sql).not.toContain("IS NULL")
    expect(args[3]).toBe("t_y")
  })

  it("bucket fora da whitelist é rejeitado antes de tocar o SQL (anti-injeção)", async () => {
    await expect(
      approvedRevenueByBucket({
        start,
        end,
        // @ts-expect-error — força bucket inválido para provar a whitelist
        bucket: "day; DROP TABLE payments",
      }),
    ).rejects.toThrow(/bucket inválido/)
    expect(p.$queryRawUnsafe).not.toHaveBeenCalled()
  })
})

describe("approvedRevenueTotal — where.tenantId por escopo (QA-014)", () => {
  it("tenantId presente → where.tenantId = id", async () => {
    await approvedRevenueTotal({ start, end, tenantId: "t_x" })
    const arg = p.payment.aggregate.mock.calls.at(-1)![0]
    expect(arg.where.tenantId).toBe("t_x")
  })

  it("segment=pmb → where.tenantId = null", async () => {
    await approvedRevenueTotal({ start, end, segment: "pmb" })
    const arg = p.payment.aggregate.mock.calls.at(-1)![0]
    expect(arg.where.tenantId).toBeNull()
  })

  it("segment=revenda → where.tenantId = { not: null }", async () => {
    await approvedRevenueTotal({ start, end, segment: "revenda" })
    const arg = p.payment.aggregate.mock.calls.at(-1)![0]
    expect(arg.where.tenantId).toEqual({ not: null })
  })

  it("sem tenantId nem segment → sem chave tenantId (visão 'todos')", async () => {
    await approvedRevenueTotal({ start, end })
    const arg = p.payment.aggregate.mock.calls.at(-1)![0]
    expect("tenantId" in arg.where).toBe(false)
  })

  it("soma o _sum.amount retornado", async () => {
    p.payment.aggregate.mockResolvedValue({ _sum: { amount: 1234.5 } })
    const total = await approvedRevenueTotal({ start, end, tenantId: "t_x" })
    expect(total).toBe(1234.5)
  })
})
