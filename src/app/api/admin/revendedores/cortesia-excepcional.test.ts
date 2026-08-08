import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * Cortesia excepcional ("blacklist"): unidade suspensa/cancelada que NUNCA pagou
 * não volta ao ar de graça, com prazo esticado ou com promoção — só com
 * `unidades.cortesiaExcepcional` e justificativa.
 *
 * O caso que originou a regra: unidades nascidas em cortesia ou com a 1ª
 * cobrança lá na frente (`valedosaber` D+20, `andersoncidade` D+15) nunca
 * pagaram, foram suspensas e voltavam de graça — produzindo churn falso e
 * receita nenhuma.
 *
 * O TESTE QUE MAIS IMPORTA é `CANCELLED → PENDING`. Um gate que olhasse só o
 * status de DESTINO seria contornado por duas chamadas lícitas:
 * `CANCELLED → PENDING` (destino não é ACTIVE, passa) e depois
 * `PENDING → ACTIVE` (origem não é mais cancelada, passa). Por isso o gate olha
 * a ORIGEM. Reverter isso tem que quebrar este arquivo.
 */

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), update: vi.fn() },
  // `findFirst` prova a posse da cobrança (`assertPaymentInScope`); `updateMany`
  // espelha a edição no banco.
  tenantPayment: { findFirst: vi.fn(), updateMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))

const logAudit = vi.hoisted(() => vi.fn())
vi.mock("@/lib/audit", () => ({ logAudit }))

vi.mock("@/lib/auto-block", () => ({
  blockTenantStudents: vi.fn(async () => ({
    affectedStudents: 0,
    affectedEnrollments: 0,
    errors: [],
  })),
  unblockTenantStudents: vi.fn(async () => ({
    affectedStudents: 0,
    affectedEnrollments: 0,
    errors: [],
  })),
}))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/tenant/cache-invalidation", () => ({ invalidateTenantCache: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

const getPayment = vi.hoisted(() => vi.fn(async () => ({ status: "PENDING" })))
const updatePayment = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock("@/lib/asaas/client", () => ({
  getPayment,
  updatePayment,
  deletePayment: vi.fn(),
  findOrCreateAsaasCustomer: vi.fn(),
  createSubscription: vi.fn(async () => ({ id: "sub_1" })),
  cancelSubscription: vi.fn(),
  getSubscription: vi.fn(),
  listPayments: vi.fn(async () => ({ data: [] })),
  updateSubscription: vi.fn(),
  motherAsaasKey: () => "key",
  AsaasApiError: class AsaasApiError extends Error {
    statusCode = 500
  },
}))
vi.mock("@/lib/asaas/promo", () => ({ createPromoBilling: vi.fn() }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => {} }))

import { PATCH as PATCH_STATUS } from "@/app/api/admin/revendedores/[id]/status/route"
import { PATCH as PATCH_BILLING } from "@/app/api/admin/revendedores/[id]/billing/route"
import { PATCH as PATCH_PAYMENT } from "@/app/api/admin/revendedores/[id]/payments/[paymentId]/route"
import { CORTESIA_AUDIT, MAX_DUE_DAYS_AHEAD } from "@/lib/tenants/lifecycle"
import { brDayStartUtc } from "@/lib/dates"
import { adminGuardFor } from "@/test/admin-ctx"

const MOTIVO = "unidade renegociou, pagamento combinado por PIX na sexta"

/** Unidade fora do ar que nunca pagou — a que o gate protege. */
function nuncaPagou(status: "SUSPENDED" | "CANCELLED" | "PENDING" | "ACTIVE") {
  return {
    id: "t1",
    slug: "unidade",
    name: "Unidade",
    customDomain: null,
    accountManagerId: null,
    salesUserId: null,
    status,
    planValue: 239,
    asaasCustomerId: "cus_1",
    asaasSubscriptionId: "sub_0",
    asaasPromoSubscriptionId: null,
    owner: { name: "Dono", email: "d@x.com", phone: null },
    tenantPayments: [] as { id: string }[],
  }
}

/** Mesma unidade, mas com uma mensalidade paga no histórico. */
function jaPagou(status: "SUSPENDED" | "CANCELLED") {
  return { ...nuncaPagou(status), tenantPayments: [{ id: "pago-1" }] }
}

/**
 * Data a N dias do DIA CIVIL BRASILEIRO — não do dia UTC.
 *
 * `new Date().toISOString()` devolve o dia UTC, e entre 21h e meia-noite no
 * Brasil ele já virou o dia seguinte. Como o gate corta por `brDayStartUtc`, um
 * helper baseado em UTC empurra os casos "exatamente no limite" um dia para
 * frente e eles passam a bater em 403 — o teste fica verde de dia e vermelho de
 * noite. Foi assim que o CI quebrou às 00:08 UTC (21:08 BRT) no commit 536dedd,
 * com o código de produção correto.
 */
function diasAFrente(dias: number): string {
  const d = brDayStartUtc()
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function statusReq(body: Record<string, unknown>) {
  return new Request("http://x/api/admin/revendedores/t1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function billingReq(body: Record<string, unknown>) {
  return new Request("http://x/api/admin/revendedores/t1/billing", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ syncWithAsaas: false, ...body }),
  })
}

function paymentReq(body: Record<string, unknown>) {
  return new Request("http://x/api/admin/revendedores/t1/payments/pay_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const statusParams = { params: Promise.resolve({ id: "t1" }) }
const paymentParams = { params: Promise.resolve({ id: "t1", paymentId: "pay_1" }) }

/**
 * Diretor de unidades: o papel mais forte abaixo do super admin — vê a rede
 * inteira, edita status e cobrança de qualquer unidade — e ainda assim NÃO tem
 * a cortesia excepcional. Se o gate cede para ele, cede para todo mundo.
 */
function semCortesia() {
  requireAdmin.mockImplementation(
    adminGuardFor({ userId: "u2", role: "PMB_RESELLER_DIRECTOR" }).requireAdmin,
  )
}

/** Super admin — tem a permissão, mas ainda precisa justificar. */
function comCortesia() {
  requireAdmin.mockImplementation(
    adminGuardFor({ userId: "u1", role: "SUPER_ADMIN" }).requireAdmin,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  comCortesia()
  db.tenant.update.mockResolvedValue({})
  db.tenantPayment.findFirst.mockResolvedValue({ id: "tp1" })
  db.tenantPayment.updateMany.mockResolvedValue({ count: 1 })
  getPayment.mockResolvedValue({ status: "PENDING" })
})

describe("status — laundering por PENDING", () => {
  /*
   * A REGRESSÃO CRÍTICA. Se este teste passar a devolver 200, o recurso inteiro
   * está furado: basta uma segunda chamada PENDING → ACTIVE para reativar de
   * graça qualquer unidade que nunca pagou.
   */
  it("CANCELLED → PENDING é bloqueado (não só ACTIVE)", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("CANCELLED"))

    const res = await PATCH_STATUS(statusReq({ status: "PENDING" }), statusParams)

    expect(res.status).toBe(403)
    expect(db.tenant.update).not.toHaveBeenCalled()
  })

  it("SUSPENDED → PENDING é bloqueado", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_STATUS(statusReq({ status: "PENDING" }), statusParams)

    expect(res.status).toBe(403)
  })

  it("PENDING → ACTIVE segue livre para quem nunca foi suspensa", async () => {
    // Unidade nova, aguardando o 1º pagamento: não é o caso da regra.
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("PENDING"))

    const res = await PATCH_STATUS(statusReq({ status: "ACTIVE" }), statusParams)

    expect(res.status).toBe(200)
  })
})

describe("status — reativação", () => {
  it("bloqueia quem nunca pagou, sem a permissão", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_STATUS(statusReq({ status: "ACTIVE" }), statusParams)

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain("nunca pagou")
    expect(body.requiresReason).toBe(false)
    expect(db.tenant.update).not.toHaveBeenCalled()
  })

  it("libera quem já pagou, mesmo sem a permissão", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(jaPagou("SUSPENDED"))

    const res = await PATCH_STATUS(statusReq({ status: "ACTIVE" }), statusParams)

    expect(res.status).toBe(200)
    expect(db.tenant.update).toHaveBeenCalled()
  })

  it("super admin sem motivo recebe requiresReason", async () => {
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("CANCELLED"))

    const res = await PATCH_STATUS(statusReq({ status: "ACTIVE" }), statusParams)

    expect(res.status).toBe(403)
    expect((await res.json()).requiresReason).toBe(true)
    expect(db.tenant.update).not.toHaveBeenCalled()
  })

  it("super admin com motivo passa e o motivo vai para a auditoria", async () => {
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("CANCELLED"))

    const res = await PATCH_STATUS(
      statusReq({ status: "ACTIVE", reason: MOTIVO }),
      statusParams,
    )

    expect(res.status).toBe(200)
    expect(db.tenant.update).toHaveBeenCalled()
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: CORTESIA_AUDIT.granted,
        payloadAfter: expect.objectContaining({ reason: MOTIVO }),
      }),
    )
  })

  it("suspender e cancelar seguem livres (não são reativação)", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("ACTIVE"))

    for (const status of ["SUSPENDED", "CANCELLED"]) {
      db.tenant.update.mockClear()
      const res = await PATCH_STATUS(statusReq({ status }), statusParams)
      expect(res.status).toBe(200)
      expect(db.tenant.update).toHaveBeenCalled()
    }
  })

  /** É assim que o dono enxerga quem insiste em reabrir unidade que não paga. */
  it("registra a tentativa negada na auditoria", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    await PATCH_STATUS(statusReq({ status: "ACTIVE" }), statusParams)

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: CORTESIA_AUDIT.blocked }),
    )
  })
})

describe("billing — cortesia, promoção e prazo", () => {
  it("bloqueia tornar gratuita (planValue 0)", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_BILLING(billingReq({ planValue: 0 }), statusParams)

    expect(res.status).toBe(403)
    expect(db.tenant.update).not.toHaveBeenCalled()
  })

  it("bloqueia conceder promoção", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("CANCELLED"))

    const res = await PATCH_BILLING(
      billingReq({ planValue: 239, promoMonths: 6, promoValue: 1 }),
      statusParams,
    )

    expect(res.status).toBe(403)
  })

  it("bloqueia vencimento além do limite", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_BILLING(
      billingReq({ nextDueDate: diasAFrente(MAX_DUE_DAYS_AHEAD + 1) }),
      statusParams,
    )

    expect(res.status).toBe(403)
  })

  it("aceita vencimento dentro do limite", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_BILLING(
      billingReq({ nextDueDate: diasAFrente(MAX_DUE_DAYS_AHEAD) }),
      statusParams,
    )

    expect(res.status).toBe(200)
  })

  it("libera tudo para unidade que já pagou", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(jaPagou("SUSPENDED"))

    const res = await PATCH_BILLING(billingReq({ planValue: 0 }), statusParams)

    expect(res.status).toBe(200)
  })

  it("super admin com motivo torna gratuita e audita", async () => {
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_BILLING(
      billingReq({ planValue: 0, reason: MOTIVO }),
      statusParams,
    )

    expect(res.status).toBe(200)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: CORTESIA_AUDIT.granted,
        payloadAfter: expect.objectContaining({ trigger: "free", reason: MOTIVO }),
      }),
    )
  })

  /*
   * O gate roda ANTES de qualquer chamada ao Asaas. Bloquear depois deixaria a
   * assinatura já cancelada lá e a unidade sem cobrança nenhuma.
   */
  it("não toca no Asaas quando bloqueia", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const { cancelSubscription } = await import("@/lib/asaas/client")
    await PATCH_BILLING(
      new Request("http://x/api/admin/revendedores/t1/billing", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planValue: 0 }),
      }),
      statusParams,
    )

    expect(cancelSubscription).not.toHaveBeenCalled()
  })
})

describe("cobrança individual — adiamento", () => {
  it("bloqueia adiar além do limite", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_PAYMENT(
      paymentReq({ dueDate: diasAFrente(MAX_DUE_DAYS_AHEAD + 5) }),
      paymentParams,
    )

    expect(res.status).toBe(403)
    expect(updatePayment).not.toHaveBeenCalled()
  })

  it("aceita adiar dentro do limite", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_PAYMENT(
      paymentReq({ dueDate: diasAFrente(MAX_DUE_DAYS_AHEAD) }),
      paymentParams,
    )

    expect(res.status).toBe(200)
    expect(updatePayment).toHaveBeenCalled()
  })

  it("libera adiamento longo para unidade que já pagou", async () => {
    semCortesia()
    db.tenant.findUnique.mockResolvedValue(jaPagou("SUSPENDED"))

    const res = await PATCH_PAYMENT(
      paymentReq({ dueDate: diasAFrente(60) }),
      paymentParams,
    )

    expect(res.status).toBe(200)
  })

  it("super admin com motivo adia e audita", async () => {
    db.tenant.findUnique.mockResolvedValue(nuncaPagou("SUSPENDED"))

    const res = await PATCH_PAYMENT(
      paymentReq({ dueDate: diasAFrente(60), reason: MOTIVO }),
      paymentParams,
    )

    expect(res.status).toBe(200)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: CORTESIA_AUDIT.granted,
        payloadAfter: expect.objectContaining({ trigger: "postpone" }),
      }),
    )
  })
})
