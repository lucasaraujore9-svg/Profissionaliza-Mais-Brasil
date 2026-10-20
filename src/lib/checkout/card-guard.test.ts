import { describe, it, expect, vi, beforeEach } from "vitest"

// Redis em memoria: so os comandos que a trava usa.
const { store, flags, fake } = vi.hoisted(() => {
  const store = new Map<string, number | Set<string> | string>()
  const flags = { failRedis: false }
  const failRedis = () => flags.failRedis
  const fake = {
  exists: async (k: string) => {
    if (failRedis()) throw new Error("upstash down")
    return store.has(k) ? 1 : 0
  },
  incr: async (k: string) => {
    if (failRedis()) throw new Error("upstash down")
    const n = ((store.get(k) as number) ?? 0) + 1
    store.set(k, n)
    return n
  },
  expire: async () => 1,
  sadd: async (k: string, v: string) => {
    const s = (store.get(k) as Set<string>) ?? new Set<string>()
    s.add(v)
    store.set(k, s)
    return 1
  },
  scard: async (k: string) => ((store.get(k) as Set<string>) ?? new Set()).size,
  set: async (k: string, v: string, opts?: { nx?: boolean }) => {
    if (opts?.nx && store.has(k)) return null
    store.set(k, v)
    return "OK"
  },
  }
  return { store, flags, fake }
})
vi.mock("@/lib/redis", () => ({ redis: fake }))

const createNotification = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({})))
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))

import {
  assertAccountCardOpen,
  assertCardAttemptAllowed,
  CARD_GUARD,
  CardGuardError,
  recordCardRefusal,
} from "./card-guard"

const KEY = "chave-da-unidade"
const attempt = (card: string, cpf: string, apiKey = KEY) =>
  assertCardAttemptAllowed({ apiKey, cardNumber: card, holderCpf: cpf })

beforeEach(() => {
  store.clear()
  flags.failRedis = false
  createNotification.mockClear()
})

describe("card guard", () => {
  it("libera a compra normal", async () => {
    await expect(attempt("5555 4444 3333 1111", "111.444.777-35")).resolves.toBeUndefined()
  })

  it("recusa o MESMO cartao com outro CPF (robo trocando identidade)", async () => {
    await attempt("5555444433331111", "11144477735")
    await expect(attempt("5555444433331111", "52998224725")).rejects.toMatchObject({
      reason: "card_cpf_mismatch",
    })
  })

  it("recusa o mesmo cartao alem do limite de tentativas por hora", async () => {
    for (let i = 0; i < CARD_GUARD.cardAttempts; i++) await attempt("4111111111111111", "11144477735")
    await expect(attempt("4111111111111111", "11144477735")).rejects.toMatchObject({
      reason: "card_attempts",
    })
  })

  it("abre o disjuntor da conta apos N recusas e avisa o SUPER_ADMIN uma vez", async () => {
    for (let i = 0; i < CARD_GUARD.accountRefusals + 3; i++) await recordCardRefusal(KEY)
    expect(createNotification).toHaveBeenCalledTimes(1)
    // cartao novo, CPF novo — o robo nao escapa trocando os dois
    await expect(attempt("5105105105105100", "39053344705")).rejects.toBeInstanceOf(CardGuardError)
    await expect(assertAccountCardOpen(KEY)).rejects.toMatchObject({ reason: "account_tripped" })
  })

  it("disjuntor e por CONTA: outra unidade segue vendendo", async () => {
    for (let i = 0; i < CARD_GUARD.accountRefusals; i++) await recordCardRefusal(KEY)
    await expect(attempt("5105105105105100", "39053344705", "outra-conta")).resolves.toBeUndefined()
  })

  it("abaixo do limite nao dispara", async () => {
    for (let i = 0; i < CARD_GUARD.accountRefusals - 1; i++) await recordCardRefusal(KEY)
    await expect(assertAccountCardOpen(KEY)).resolves.toBeUndefined()
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("fail-open quando o Redis cai", async () => {
    flags.failRedis = true
    await expect(attempt("5555444433331111", "11144477735")).resolves.toBeUndefined()
    await expect(assertAccountCardOpen(KEY)).resolves.toBeUndefined()
  })

  it("nunca guarda o numero do cartao nem a chave", async () => {
    await attempt("5555444433331111", "11144477735")
    await recordCardRefusal(KEY)
    const dump = JSON.stringify([...store.keys()])
    expect(dump).not.toContain("5555444433331111")
    expect(dump).not.toContain(KEY)
  })
})
