import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Prisma } from "@prisma/client"

/**
 * A LISTA DE PAGAMENTO NO DIA 1.
 *
 * Ate 09/2026 o payout so nascia no dia da liberacao: o financeiro descobria
 * quanto havia a pagar no proprio dia 20 e nao tinha como antecipar. Agora a
 * competencia fechada entra na lista assim que o mes vira, ainda PENDING.
 *
 * O teste roda `processMonthlyPayouts` contra um Prisma falso que AVALIA a
 * clausula `where` de verdade contra as linhas — entao tirar o ramo PENDING da
 * selecao (ou trocar o `lt` do cutoff) derruba estes casos em vez de passar
 * despercebido.
 */

interface Row {
  id: string
  referrerTenantId: string
  amount: Prisma.Decimal
  availableAt: Date
  status: "PENDING" | "AVAILABLE" | "PAID" | "CANCELLED"
  payoutId: string | null
  cancelReason: string | null
}

/** Avalia as formas de `where` que processMonthlyPayouts usa. */
function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      const branches = cond as Record<string, unknown>[]
      if (!branches.some((b) => matches(row, b))) return false
      continue
    }
    const value = (row as unknown as Record<string, unknown>)[key]
    if (cond === null) {
      if (value !== null) return false
    } else if (cond instanceof Date || typeof cond === "string") {
      if (value !== cond) return false
    } else if (typeof cond === "object") {
      const c = cond as Record<string, unknown>
      if ("lte" in c && !(value instanceof Date && value <= (c.lte as Date))) return false
      if ("lt" in c && !(value instanceof Date && value < (c.lt as Date))) return false
      if ("in" in c && !(c.in as unknown[]).includes(value)) return false
      if ("startsWith" in c) {
        if (typeof value !== "string" || !value.startsWith(c.startsWith as string))
          return false
      }
    }
  }
  return true
}

const state: { monthly: Row[]; legacy: Row[]; created: Record<string, unknown>[] } = {
  monthly: [],
  legacy: [],
  created: [],
}

function tableMock(get: () => Row[]) {
  return {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      get().filter((r) => matches(r, where)),
    ),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      get().find((r) => matches(r, where)) ?? null,
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: Record<string, unknown>
        data: Record<string, unknown>
      }) => {
        const ids = (where.id as { in: string[] } | undefined)?.in
        const hit = get().filter(
          (r) => (!ids || ids.includes(r.id)) && matches(r, { ...where, id: undefined }),
        )
        for (const r of hit) Object.assign(r, data)
        return { count: hit.length }
      },
    ),
  }
}

vi.mock("@/lib/prisma", () => {
  const legacy = tableMock(() => state.legacy)
  const monthly = tableMock(() => state.monthly)
  const referralPayout = {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `payout-${state.created.length + 1}`, ...data }
      state.created.push(row)
      return row
    }),
  }
  return {
    prisma: {
      systemSettings: {
        findUnique: vi.fn(async () => ({
          referralEnabled: true,
          referralMinPayout: new Prisma.Decimal(50),
          referralPayoutDay: 20,
        })),
      },
      referralCommission: legacy,
      referralMonthlyCommission: monthly,
      referralPayout,
      tenant: {
        findUnique: vi.fn(async () => ({
          name: "Unidade Indicadora",
          pixKey: "chave@pix",
          pixKeyType: "EMAIL",
        })),
      },
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) =>
        cb({
          referralPayout,
          referralCommission: legacy,
          referralMonthlyCommission: monthly,
          tenant: {
            findUnique: vi.fn(async () => ({
              name: "Unidade Indicadora",
              pixKey: "chave@pix",
              pixKeyType: "EMAIL",
            })),
          },
        }),
      ),
    },
  }
})

const notify = vi.fn()
vi.mock("@/lib/notifications", () => ({
  createNotification: async (...args: unknown[]) => {
    notify(...args)
  },
}))

import { processMonthlyPayouts } from "./payout"

function monthlyRow(over: Partial<Row> & Pick<Row, "id" | "referrerTenantId">): Row {
  return {
    amount: new Prisma.Decimal(300),
    availableAt: new Date("2026-09-20T00:00:00Z"),
    status: "PENDING",
    payoutId: null,
    cancelReason: null,
    ...over,
  }
}

beforeEach(() => {
  state.monthly = []
  state.legacy = []
  state.created = []
  notify.mockReset()
  // Dia 1, logo depois de agosto fechar.
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-01T05:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("processMonthlyPayouts — antecipação da lista de pagamento", () => {
  it("no dia 1 monta o payout da competência fechada, que só será liberada no dia 20", async () => {
    state.monthly = [monthlyRow({ id: "ago", referrerTenantId: "t1" })]

    const result = await processMonthlyPayouts()

    expect(result.payoutsCreated).toBe(1)
    const payout = state.created[0]
    expect(Number(payout.amount)).toBe(300)
    // A data prevista de liberação vai gravada: é ela que diz ao financeiro que
    // este pagamento está sendo ANTECIPADO, e não atrasado.
    expect((payout.dueAt as Date).toISOString()).toBe("2026-09-20T00:00:00.000Z")
    // A comissão foi vinculada ao payout SEM ser promovida: a unidade continua
    // vendo "liberado dia 20". Antecipamos o pagamento, não a promessa.
    expect(state.monthly[0].payoutId).toBe(payout.id)
    expect(state.monthly[0].status).toBe("PENDING")
  })

  it("NÃO antecipa a competência que só vence no mês seguinte", async () => {
    state.monthly = [
      monthlyRow({
        id: "set",
        referrerTenantId: "t2",
        availableAt: new Date("2026-10-20T00:00:00Z"),
      }),
    ]

    const result = await processMonthlyPayouts()

    expect(result.payoutsCreated).toBe(0)
    expect(state.created).toHaveLength(0)
    expect(state.monthly[0].payoutId).toBeNull()
  })

  it("no dia da liberação segue como sempre: promove para AVAILABLE e paga", async () => {
    vi.setSystemTime(new Date("2026-09-20T05:00:00Z"))
    state.monthly = [monthlyRow({ id: "ago", referrerTenantId: "t1" })]

    const result = await processMonthlyPayouts()

    expect(result.released).toBe(1)
    expect(state.monthly[0].status).toBe("AVAILABLE")
    expect(state.created).toHaveLength(1)
  })

  it("comissão sob clawback continua bloqueando a lista antecipada", async () => {
    state.monthly = [
      monthlyRow({
        id: "ago",
        referrerTenantId: "t1",
        cancelReason: "[CLAWBACK_PENDING] estorno",
      }),
    ]

    const result = await processMonthlyPayouts()

    expect(result.payoutsCreated).toBe(0)
    expect(state.created).toHaveLength(0)
  })
})
