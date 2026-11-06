import { beforeEach, describe, expect, it, vi } from "vitest"

// Cartão recusado no parcelado: a assinatura é cancelada na 1ª recusa e, SÓ com
// o cancelamento confirmado, a linha vira negada (página abre PIX/boleto/outro
// cartão) e o aluno recebe o e-mail. Invariante: a mesma parcela nunca fica
// cobrável no cartão e por fora ao mesmo tempo.

type Row = Record<string, unknown> & { id: string; number: number; status: string }
const db = vi.hoisted(() => ({ rows: [] as Row[], enrollment: {} as Record<string, unknown> }))

function matches(r: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "in" in v) return (v.in as unknown[]).includes(r[k])
    return (r[k] ?? null) === v
  })
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    enrollment: {
      findUnique: vi.fn(async ({ select }: { select: Record<string, unknown> }) =>
        "student" in select
          ? {
              id: "enr1",
              tenantId: db.enrollment.tenantId,
              student: { nome: "Lorena Silva", email: "lorena@x.com" },
              course: { nome: "Curso X" },
              tenant: db.enrollment.tenantId ? { slug: "loja", customDomain: null, domainVerified: false } : null,
            }
          : { ...db.enrollment },
      ),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(db.enrollment, data)),
    },
    boletoInstallment: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const r = db.rows.filter((x) => matches(x, where)).sort((a, b) => a.number - b.number)[0]
        return r ? { ...r } : null
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Object.assign(db.rows.find((r) => r.id === where.id)!, data),
      ),
    },
  },
}))
vi.mock("./plan", () => ({ loadContext: vi.fn() }))
vi.mock("./flex-charge", () => ({
  asaasKeyFor: () => "unit_key",
  mpTokenFor: async () => "mp_token",
  asaasEvent: (p: { id: string; value: number }) => ({ gateway: "ASAAS", externalPaymentId: p.id, amount: p.value, paidAt: new Date() }),
  readAsaasPayment: vi.fn(),
  releaseAsaasCharge: vi.fn(),
}))
vi.mock("./flex-card", () => ({
  cancelFlexSubscription: vi.fn(),
  alertPmbAdmin: vi.fn(),
  settleFlexSubscriptionPayment: vi.fn(),
}))
vi.mock("@/lib/asaas/client", () => ({ getPayment: vi.fn() }))
vi.mock("@/lib/mercadopago/client", () => ({ getPayment: vi.fn() }))
vi.mock("@/lib/enrollment/fulfill", () => ({
  advisoryLockKeyFrom: (s: string) => s,
  withAdvisoryLock: vi.fn(async (_k: unknown, fn: () => Promise<void>) => {
    await fn()
    return true
  }),
}))
vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn(async () => undefined) }))
vi.mock("@/lib/email/tenant-brand", () => ({
  loadTenantEmailBrand: vi.fn(async () => ({ name: "Loja", replyTo: "loja@x.com", isPmb: false })),
}))
vi.mock("@/lib/email/brand", () => ({
  PMB_EMAIL_BRAND: { name: "PMB", replyTo: null, isPmb: true },
  emailFromForBrand: (b: { name: string }) => `${b.name} <no-reply@x>`,
}))
const pending = vi.hoisted(() => [] as Promise<unknown>[])
vi.mock("@/lib/after-response", () => ({ afterResponse: (fn: () => Promise<unknown>) => pending.push(fn()) }))
vi.mock("@/lib/tenant/urls", () => ({
  appUrl: () => "https://pmb.test",
  storeBaseUrl: (t: { slug: string }) => `https://${t.slug}.vitrine.test`,
}))
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/logger", () => ({ contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }))

import * as asaas from "@/lib/asaas/client"
import * as mp from "@/lib/mercadopago/client"
import { sendEmail } from "@/lib/email/mailer"
import { loadContext } from "./plan"
import { readAsaasPayment, releaseAsaasCharge } from "./flex-charge"
import { alertPmbAdmin, cancelFlexSubscription } from "./flex-card"
import { flexOffer } from "./flex"
import { handleFlexCardDeclined } from "./flex-decline"

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>
const day = (iso: string) => new Date(`${iso}T12:00:00Z`)
const flush = () => Promise.all(pending.splice(0))

function plan(gateway: "ASAAS" | "MP", tenant = true) {
  db.enrollment = {
    tenantId: tenant ? "t1" : null,
    installmentMethod: "CREDIT_CARD",
    asaasSubscriptionId: gateway === "ASAAS" ? "sub_1" : null,
    mpSubscriptionId: gateway === "MP" ? "pre_1" : null,
  }
  const row = (id: string, number: number, status: string, due: string) => ({
    id, enrollmentId: "enr1", number, amount: 100, status, gateway, dueDate: day(due), cardDeclinedAt: null,
    method: number === 1 ? "PIX" : "CREDIT_CARD", asaasPaymentId: number === 1 ? "pay_entrada" : null, mpPaymentId: null,
  })
  db.rows = [row("r1", 1, "PAID", "2026-11-06"), row("r2", 2, "SCHEDULED", "2026-11-06"), row("r3", 3, "SCHEDULED", "2026-12-06")]
  m(loadContext).mockResolvedValue({
    enrollment: { id: "enr1", tenantId: tenant ? "t1" : null, flexInstallments: true, courseNome: "Curso X" },
    tenant: tenant ? { id: "t1", slug: "loja" } : null,
  })
}

const refused = { id: "pay_9", status: "PENDING", subscription: "sub_1", value: 100, deleted: false }

beforeEach(() => {
  vi.clearAllMocks()
  pending.length = 0
  m(asaas.getPayment).mockResolvedValue(refused)
  m(readAsaasPayment).mockResolvedValue({ ...refused, deleted: true })
  m(releaseAsaasCharge).mockResolvedValue({ kind: "released" })
  m(cancelFlexSubscription).mockResolvedValue(true)
  m(mp.getPayment).mockResolvedValue({ id: 555, status: "rejected" })
})

const state = () => ({
  hasDownPayment: true,
  method: "CREDIT_CARD" as const,
  subscriptionActive: Boolean(db.enrollment.asaasSubscriptionId || db.enrollment.mpSubscriptionId),
  rows: db.rows.map((r) => ({
    number: r.number,
    status: r.status as "SCHEDULED",
    dueDate: r.dueDate as Date,
    cardDeclinedAt: (r.cardDeclinedAt as Date | null) ?? null,
  })),
})

describe("handleFlexCardDeclined — Asaas", () => {
  it("cancelamento confirmado: linha negada, assinatura solta, cobrança recusada removida, e-mail 1x", async () => {
    plan("ASAAS")
    const res = await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })
    await flush()

    expect(res).toBe("declined")
    expect(cancelFlexSubscription).toHaveBeenCalledWith(expect.anything(), { asaasSubscriptionId: "sub_1" })
    expect(releaseAsaasCharge).toHaveBeenCalledTimes(1)
    expect(db.rows[1].cardDeclinedAt).toBeInstanceOf(Date)
    expect(db.rows[2].cardDeclinedAt).toBeNull()
    expect(db.enrollment.asaasSubscriptionId).toBeNull()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(m(sendEmail).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        to: "lorena@x.com",
        subject: "Seu cartão foi recusado",
        tenantId: "t1",
        template: expect.objectContaining({
          type: "installment-card-declined",
          props: expect.objectContaining({ paymentUrl: "https://loja.vitrine.test/pagar/enr1", amount: "R$ 100,00" }),
        }),
      }),
    )
  })

  it("depois de \"declined\", flexOffer com o estado gravado abre os três meios", async () => {
    plan("ASAAS")
    await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })
    expect(flexOffer(state(), new Date("2026-11-06T15:00:00Z"))).toEqual({
      kind: "pay",
      rowNumber: 2,
      methods: ["PIX", "BOLETO", "CREDIT_CARD"],
      card: "subscription",
    })
  })

  it("deleted: false → \"cancel_unconfirmed\": linha intocada (página segue auto), sem e-mail, alerta à PMB", async () => {
    plan("ASAAS")
    m(cancelFlexSubscription).mockResolvedValue(false)
    const res = await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })
    await flush()

    expect(res).toBe("cancel_unconfirmed")
    expect(db.rows[1].cardDeclinedAt).toBeNull()
    expect(db.enrollment.asaasSubscriptionId).toBe("sub_1")
    expect(sendEmail).not.toHaveBeenCalled()
    expect(alertPmbAdmin).toHaveBeenCalledTimes(1)
    expect(m(alertPmbAdmin).mock.calls[0][1]).toContain("sub_1")
    expect(flexOffer(state(), new Date("2026-11-06T15:00:00Z")).kind).toBe("auto")
  })

  it("assinatura cancelada mas a cobrança recusada não sai do ar → \"cancel_unconfirmed\", linha intocada", async () => {
    plan("ASAAS")
    m(releaseAsaasCharge).mockResolvedValue({ kind: "stuck" })
    const res = await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })
    await flush()

    expect(res).toBe("cancel_unconfirmed")
    expect(db.rows[1].cardDeclinedAt).toBeNull()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(m(alertPmbAdmin).mock.calls[0][1]).toContain("pay_9")
  })

  it("2ª recusa da mesma linha → \"ignored\", sem 2º e-mail nem 2º cancelamento", async () => {
    plan("ASAAS")
    await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })
    const res = await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })
    await flush()

    expect(res).toBe("ignored")
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(cancelFlexSubscription).toHaveBeenCalledTimes(1)
  })

  it("recusa de OUTRA assinatura (antiga) não cancela a vigente", async () => {
    plan("ASAAS")
    m(asaas.getPayment).mockResolvedValue({ ...refused, subscription: "sub_antiga" })
    const res = await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })

    expect(res).toBe("ignored")
    expect(cancelFlexSubscription).not.toHaveBeenCalled()
    expect(db.rows[1].cardDeclinedAt).toBeNull()
  })

  it("lock da matrícula ocupado (assinatura nascendo): lança para o gateway reentregar", async () => {
    plan("ASAAS")
    const { withAdvisoryLock } = await import("@/lib/enrollment/fulfill")
    m(withAdvisoryLock).mockResolvedValueOnce(false)
    await expect(handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "pay_9" })).rejects.toThrow()
    expect(cancelFlexSubscription).not.toHaveBeenCalled()
  })
})

describe("handleFlexCardDeclined — Mercado Pago", () => {
  it("preapproval cancelado (status cancelled): linha negada, e-mail com o link da PMB", async () => {
    plan("MP", false)
    const res = await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "555" })
    await flush()

    expect(res).toBe("declined")
    expect(cancelFlexSubscription).toHaveBeenCalledWith(expect.anything(), { mpSubscriptionId: "pre_1" })
    expect(db.enrollment.mpSubscriptionId).toBeNull()
    expect(db.rows[1].cardDeclinedAt).toBeInstanceOf(Date)
    expect(m(sendEmail).mock.calls[0][0].template.props.paymentUrl).toBe("https://pmb.test/pagar/enr1")
  })

  it("pagamento que não está rejected no MP → \"ignored\"", async () => {
    plan("MP", false)
    m(mp.getPayment).mockResolvedValue({ id: 555, status: "approved" })
    expect(await handleFlexCardDeclined({ enrollmentId: "enr1", gatewayPaymentId: "555" })).toBe("ignored")
    expect(cancelFlexSubscription).not.toHaveBeenCalled()
  })
})
