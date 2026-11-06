import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Cartão no parcelado = assinatura do gateway sobre as linhas restantes. O
// invariante: cada cobrança da assinatura baixa UMA linha, uma vez só, e toda
// assinatura Asaas leva o rateio.

type Row = Record<string, unknown> & { id: string; number: number; status: string }
const db = vi.hoisted(() => ({ rows: [] as Row[] }))

function matches(r: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in v) return (v.in as unknown[]).includes(r[k])
    if (v && typeof v === "object" && "gte" in v) return (r[k] as number) >= (v.gte as number)
    return (r[k] ?? null) === v
  })
}
const select = (where: Record<string, unknown>) =>
  db.rows.filter((r) => matches(r, where)).sort((a, b) => a.number - b.number)

vi.mock("@/lib/prisma", async () => {
  const { Prisma } = await import("@prisma/client")
  return {
    prisma: {
      enrollment: { findUnique: vi.fn(), update: vi.fn() },
      boletoInstallment: {
        findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => select(where).map((r) => ({ ...r }))),
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
          const r = select(where)[0]
          return r ? { ...r } : null
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
          Object.assign(db.rows.find((r) => r.id === where.id)!, data),
        ),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          // @unique de asaasPaymentId / mpPaymentId
          for (const [k, v] of Object.entries(data)) {
            if (/PaymentId$/.test(k) && v && db.rows.some((r) => r[k] === v)) {
              throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" })
            }
          }
          const hit = select(where)
          hit.forEach((r) => Object.assign(r, data))
          return { count: hit.length }
        }),
      },
    },
  }
})
vi.mock("./plan", () => ({ loadContext: vi.fn(), resolveAsaasCustomerId: vi.fn(async () => "cus_1") }))
vi.mock("@/lib/asaas/client", () => {
  class AsaasApiError extends Error {
    statusCode: number
    constructor(message: string, statusCode = 400) {
      super(message)
      this.statusCode = statusCode
    }
  }
  return {
    AsaasApiError,
    decryptTenantAsaasKey: () => "unit_key",
    motherAsaasKey: () => "mother_key",
    getPayment: vi.fn(),
    createPayment: vi.fn(),
    deletePayment: vi.fn(async () => ({ deleted: true })),
    listPayments: vi.fn(),
    payWithCreditCard: vi.fn(),
    createSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
  }
})
vi.mock("@/lib/mercadopago/client", () => {
  class MPApiError extends Error {
    constructor(message: string, public readonly statusCode: number) {
      super(message)
    }
  }
  return {
    MPApiError,
    decryptTenantMpToken: () => "mp_token",
    getPayment: vi.fn(),
    createPayment: vi.fn(),
    cancelPayment: vi.fn(),
    createPreapproval: vi.fn(),
    cancelPreapproval: vi.fn(),
  }
})
const lock = vi.hoisted(() => ({ busy: false }))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: () => BigInt(1),
  withAdvisoryLock: vi.fn(async (_k: bigint, fn: () => Promise<void>) => {
    if (lock.busy) return false
    await fn()
    return true
  }),
}))
vi.mock("@/lib/asaas/fulfillment", () => ({ fulfillFromAsaasPayment: vi.fn() }))
vi.mock("@/lib/checkout/free-enrollment", () => ({ isFreeAmount: () => false, releaseFreeEnrollment: vi.fn() }))
vi.mock("./settle", () => ({
  // Como o real: marca a linha PAID.
  settleBoletoInstallment: vi.fn(async ({ installment }: { installment: { id: string } }) => {
    db.rows.find((r) => r.id === installment.id)!.status = "PAID"
  }),
}))
vi.mock("@/lib/course-authoring/split-server", () => ({ asaasSplitsForEnrollment: vi.fn() }))
vi.mock("@/lib/subscriptions/carne", () => ({ saveBoletoAddress: vi.fn() }))
vi.mock("@/lib/tenant/urls", () => ({
  asaasWebhookUrl: () => "https://x/asaas",
  mpWebhookUrl: () => "https://x/mp",
  appUrl: () => "https://pmb",
}))
vi.mock("@/lib/pmb-config", () => ({
  pmbMpAccessToken: async () => "pmb_mp",
  pmbPlataformaPolo: () => "pmb",
  pmbPlataformaVendedorId: () => null,
  PMB_TENANT_SLUG: "__pmb__",
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import { prisma } from "@/lib/prisma"
import * as asaas from "@/lib/asaas/client"
import * as mp from "@/lib/mercadopago/client"
import { settleBoletoInstallment } from "./settle"
import { asaasSplitsForEnrollment } from "@/lib/course-authoring/split-server"
import { logAudit } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"
import { loadContext } from "./plan"
import { settleFlexSubscriptionPayment, startFlexCardSubscription } from "./flex-card"
import type { FlexCardInput, FlexPayer } from "./flex-charge"

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>
const enrollment = prisma.enrollment as unknown as Record<"findUnique" | "update", ReturnType<typeof vi.fn>>

const payer: FlexPayer = { nome: "Lorena Silva", email: "l@x.com", cpf: "11418766550", remoteIp: "1.2.3.4" }
const asaasCard: FlexCardInput = {
  gateway: "ASAAS",
  creditCard: { holderName: "LORENA", number: "4111", expiryMonth: "12", expiryYear: "2030", ccv: "123" },
  creditCardHolderInfo: { name: "Lorena", email: "l@x.com", cpfCnpj: "11418766550", postalCode: "01001000", addressNumber: "10", phone: "11999999999" },
}
const mpCard: FlexCardInput = { gateway: "MP", token: "tok_1", paymentMethodId: "visa" }
const SPLITS = [{ walletId: "w_prod", percentualValue: 30 }]
const day = (iso: string) => new Date(`${iso}T12:00:00Z`)

function plan(gateway: "ASAAS" | "MP", opts: { tenant?: boolean } = {}) {
  const tenant = opts.tenant ?? true
  db.rows = [
    { id: "r1", enrollmentId: "enr1", number: 1, amount: 300, status: "PAID", gateway, method: "PIX", asaasPaymentId: "pay_entrada", mpPaymentId: null, dueDate: day("2026-11-06"), cardDeclinedAt: null },
    { id: "r2", enrollmentId: "enr1", number: 2, amount: 100, status: "OVERDUE", gateway, method: null, asaasPaymentId: null, mpPaymentId: null, dueDate: day("2026-11-01"), cardDeclinedAt: new Date("2026-11-02") },
    { id: "r3", enrollmentId: "enr1", number: 3, amount: 100, status: "SCHEDULED", gateway, method: null, asaasPaymentId: null, mpPaymentId: null, dueDate: day("2026-12-01"), cardDeclinedAt: null },
    { id: "r4", enrollmentId: "enr1", number: 4, amount: 100, status: "SCHEDULED", gateway, method: null, asaasPaymentId: null, mpPaymentId: null, dueDate: day("2027-01-01"), cardDeclinedAt: null },
  ]
  m(loadContext).mockResolvedValue({
    enrollment: {
      id: "enr1",
      tenantId: tenant ? "t1" : null,
      externalReference: tenant ? "enr_enr1" : "pmb_enr_enr1",
      courseNome: "Curso X",
      flexInstallments: true,
      student: { id: "s1", nome: "Lorena" },
    },
    tenant: tenant
      ? { id: "t1", slug: "loja", name: "Loja", plataformaVendedorId: "v1", salesGateway: gateway, mpAccessToken: "enc", asaasApiKey: "enc" }
      : null,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  lock.busy = false
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2026-11-06T15:00:00Z"))
  enrollment.findUnique.mockResolvedValue({ asaasSubscriptionId: null, mpSubscriptionId: null })
  enrollment.update.mockResolvedValue({})
  m(asaasSplitsForEnrollment).mockResolvedValue(SPLITS)
  m(asaas.createSubscription).mockResolvedValue({ id: "sub_1" })
  m(asaas.listPayments).mockResolvedValue({ data: [{ id: "pay_1", status: "PENDING", value: 100 }] })
  m(mp.createPreapproval).mockResolvedValue({ id: "pre_1", status: "authorized" })
})
afterEach(() => vi.useRealTimers())

describe("startFlexCardSubscription — Asaas", () => {
  it("3 linhas abertas: assinatura com maxPayments 3, valor da linha, split; datas reescritas e auditadas", async () => {
    plan("ASAAS")
    const res = await startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard })

    expect(res).toEqual({ kind: "pending" })
    expect(asaas.createSubscription).toHaveBeenCalledTimes(1)
    expect(m(asaas.createSubscription).mock.calls[0]).toEqual([
      expect.objectContaining({
        customer: "cus_1",
        billingType: "CREDIT_CARD",
        cycle: "MONTHLY",
        value: 100,
        maxPayments: 3,
        nextDueDate: "2026-11-06",
        splits: SPLITS,
        externalReference: "enr_enr1",
        creditCard: asaasCard.creditCard,
        creditCardHolderInfo: asaasCard.creditCardHolderInfo,
        remoteIp: "1.2.3.4",
      }),
      "unit_key",
    ])
    expect(asaasSplitsForEnrollment).toHaveBeenCalledWith("enr1")
    expect(enrollment.update).toHaveBeenCalledWith({
      where: { id: "enr1" },
      data: expect.objectContaining({ installmentMethod: "CREDIT_CARD", asaasSubscriptionId: "sub_1" }),
    })

    const [, r2, r3, r4] = db.rows
    expect([r2, r3, r4].map((r) => (r.dueDate as Date).toISOString().slice(0, 10))).toEqual([
      "2026-11-06",
      "2026-12-06",
      "2027-01-06",
    ])
    expect([r2, r3, r4].every((r) => r.method === "CREDIT_CARD" && r.cardDeclinedAt === null)).toBe(true)
    expect(db.rows[0].dueDate).toEqual(day("2026-11-06")) // entrada paga intocada
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "enrollment.flex.card_schedule", resourceId: "enr1", tenantId: "t1" }),
    )
  })

  it("1ª cobrança capturada na hora baixa a linha da vez", async () => {
    plan("ASAAS")
    m(asaas.listPayments).mockResolvedValue({ data: [{ id: "pay_1", status: "CONFIRMED", value: 100 }] })
    const res = await startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard })

    expect(res).toEqual({ kind: "approved" })
    expect(db.rows[1]).toMatchObject({ asaasPaymentId: "pay_1", status: "PAID" })
    expect(settleBoletoInstallment).toHaveBeenCalledTimes(1)
  })

  it("PIX em aberto na linha: removido com prova ANTES da assinatura", async () => {
    plan("ASAAS")
    Object.assign(db.rows[1], { asaasPaymentId: "pix_1", status: "GENERATED", method: "PIX" })
    m(asaas.getPayment)
      .mockResolvedValueOnce({ id: "pix_1", status: "PENDING", billingType: "PIX", value: 100 })
      .mockResolvedValueOnce({ id: "pix_1", status: "PENDING", deleted: true })

    await startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard })

    expect(m(asaas.deletePayment).mock.calls[0]).toEqual(["pix_1", "unit_key"])
    expect(m(asaas.deletePayment).mock.invocationCallOrder[0]).toBeLessThan(
      m(asaas.createSubscription).mock.invocationCallOrder[0],
    )
    expect(db.rows[1].asaasPaymentId).toBeNull()
  })

  it("remoção do PIX não confirmada (deleted: false): 409 e nenhuma assinatura", async () => {
    plan("ASAAS")
    Object.assign(db.rows[1], { asaasPaymentId: "pix_1", status: "GENERATED", method: "PIX" })
    m(asaas.getPayment)
      .mockResolvedValueOnce({ id: "pix_1", status: "PENDING", billingType: "PIX", value: 100 })
      .mockResolvedValueOnce({ id: "pix_1", status: "PENDING", deleted: false })

    const res = await startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard })

    expect(res).toMatchObject({ kind: "error", httpStatus: 409, code: "PREVIOUS_CHARGE_STUCK" })
    expect(asaas.createSubscription).not.toHaveBeenCalled()
    expect(db.rows[1].asaasPaymentId).toBe("pix_1")
  })

  it("assinatura já ativa: 409 SUBSCRIPTION_ACTIVE, nada no gateway", async () => {
    plan("ASAAS")
    enrollment.findUnique.mockResolvedValue({ asaasSubscriptionId: "sub_old", mpSubscriptionId: null })
    const res = await startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard })

    expect(res).toMatchObject({ kind: "error", httpStatus: 409, code: "SUBSCRIPTION_ACTIVE" })
    expect(asaas.createSubscription).not.toHaveBeenCalled()
  })
})

describe("startFlexCardSubscription — linhas abertas com valores diferentes (I2)", () => {
  it.each(["ASAAS", "MP"] as const)("%s: 409 CARD_REQUIRES_EQUAL_ROWS e nada no gateway", async (gw) => {
    plan(gw)
    db.rows[3].amount = 150 // renegociada
    const res = await startFlexCardSubscription({
      enrollmentId: "enr1",
      fromRowNumber: 2,
      payer,
      card: gw === "ASAAS" ? asaasCard : mpCard,
    })

    expect(res).toMatchObject({ kind: "error", httpStatus: 409, code: "CARD_REQUIRES_EQUAL_ROWS" })
    expect(asaas.createSubscription).not.toHaveBeenCalled()
    expect(mp.createPreapproval).not.toHaveBeenCalled()
  })
})

describe("assinatura criada mas não gravada (falha no banco)", () => {
  it("Asaas: cancela a assinatura no gateway e relança; cancelamento confirmado não alerta", async () => {
    plan("ASAAS")
    enrollment.update.mockRejectedValueOnce(new Error("db down"))
    m(asaas.cancelSubscription).mockResolvedValue({ deleted: true, id: "sub_1" })

    await expect(
      startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard }),
    ).rejects.toThrow("db down")

    expect(asaas.cancelSubscription).toHaveBeenCalledWith("sub_1", "unit_key")
    expect(createNotification).not.toHaveBeenCalled()
  })

  it("Asaas: cancelamento NÃO confirmado (deleted: false) alerta o SUPER_ADMIN", async () => {
    plan("ASAAS")
    enrollment.update.mockRejectedValueOnce(new Error("db down"))
    m(asaas.cancelSubscription).mockResolvedValue({ deleted: false, id: "sub_1" })

    await expect(
      startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: asaasCard }),
    ).rejects.toThrow("db down")

    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "ROLE", roleTarget: "SUPER_ADMIN", body: expect.stringContaining("sub_1") }),
    )
  })

  it("MP: preapproval não cancelado alerta o SUPER_ADMIN", async () => {
    plan("MP", { tenant: false })
    enrollment.update.mockRejectedValueOnce(new Error("db down"))
    m(mp.cancelPreapproval).mockResolvedValue({ id: "pre_1", status: "authorized" })

    await expect(
      startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: mpCard }),
    ).rejects.toThrow("db down")

    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pmb_mp", "pre_1")
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ roleTarget: "SUPER_ADMIN" }))
  })
})

describe("startFlexCardSubscription — Mercado Pago", () => {
  it("preapproval com a referência da matrícula, valor da linha e fim no nº de linhas", async () => {
    plan("MP", { tenant: false })
    const res = await startFlexCardSubscription({ enrollmentId: "enr1", fromRowNumber: 2, payer, card: mpCard })

    expect(res).toEqual({ kind: "pending" })
    const [token, params] = m(mp.createPreapproval).mock.calls[0]
    expect(token).toBe("pmb_mp")
    expect(params).toMatchObject({
      external_reference: "pmb_enr_enr1",
      card_token_id: "tok_1",
      payer_email: "l@x.com",
      status: "authorized",
      auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 100, currency_id: "BRL" },
    })
    // 3 cobranças mensais: o fim cai depois da 3ª e antes da 4ª.
    const end = new Date(params.auto_recurring.end_date).getTime()
    expect(end).toBeGreaterThan(new Date("2027-01-06").getTime())
    expect(end).toBeLessThan(new Date("2027-02-06").getTime())
    expect(enrollment.update).toHaveBeenCalledWith({
      where: { id: "enr1" },
      data: expect.objectContaining({ installmentMethod: "CREDIT_CARD", mpSubscriptionId: "pre_1" }),
    })
  })
})

describe("settleFlexSubscriptionPayment", () => {
  const event = { gateway: "ASAAS" as const, externalPaymentId: "pay_9", amount: 100, paidAt: new Date() }

  it("mesmo asaasPaymentId duas vezes: a 2ª devolve duplicate e só UMA linha é baixada", async () => {
    plan("ASAAS")
    db.rows.slice(1).forEach((r) => Object.assign(r, { method: "CREDIT_CARD", status: "SCHEDULED", cardDeclinedAt: null }))

    expect(await settleFlexSubscriptionPayment({ enrollmentId: "enr1", event })).toBe("settled")
    expect(await settleFlexSubscriptionPayment({ enrollmentId: "enr1", event })).toBe("duplicate")

    expect(settleBoletoInstallment).toHaveBeenCalledTimes(1)
    expect(db.rows[1]).toMatchObject({ asaasPaymentId: "pay_9", status: "PAID" })
    expect(db.rows[2]).toMatchObject({ asaasPaymentId: null, status: "SCHEDULED" })
  })

  it("pagamento sem linha aberta: no_open_row, nada muda, PMB e unidade avisadas, auditado", async () => {
    plan("ASAAS")
    db.rows.forEach((r) => (r.status = "PAID"))
    enrollment.findUnique.mockResolvedValue({ tenantId: "t1" })
    const before = JSON.stringify(db.rows)

    expect(await settleFlexSubscriptionPayment({ enrollmentId: "enr1", event })).toBe("no_open_row")
    expect(JSON.stringify(db.rows)).toBe(before)
    expect(settleBoletoInstallment).not.toHaveBeenCalled()
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "ROLE", roleTarget: "SUPER_ADMIN", body: expect.stringMatching(/pay_9.*R\$ 100,00.*enr1/) }),
    )
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ audience: "TENANT", tenantId: "t1" }))
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "enrollment.flex.card_unmatched_payment", resourceId: "enr1", tenantId: "t1" }),
    )
  })

  it("webhook antes de a criação gravar as linhas (lock FLEX_CARD ocupado): espera, baixa e não alerta", async () => {
    plan("ASAAS")
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] })
    vi.setSystemTime(new Date("2026-11-06T15:00:00Z"))
    lock.busy = true // criação em andamento
    const pending = settleFlexSubscriptionPayment({ enrollmentId: "enr1", event })
    await vi.advanceTimersByTimeAsync(10)
    // a criação termina: linhas no cartão
    db.rows.slice(1).forEach((r) => Object.assign(r, { method: "CREDIT_CARD", status: "SCHEDULED" }))
    lock.busy = false
    await vi.advanceTimersByTimeAsync(3_000)

    expect(await pending).toBe("settled")
    expect(db.rows[1]).toMatchObject({ asaasPaymentId: "pay_9", status: "PAID" })
    expect(createNotification).not.toHaveBeenCalled()
  })
})
