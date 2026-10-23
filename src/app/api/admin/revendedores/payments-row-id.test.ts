import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * O historico de cobrancas de /admin/revendedores/[id] mescla o banco com a
 * lista do Asaas. A linha que vem do Asaas tem de carregar o `id` DO BANCO:
 * baixa manual e estorno buscam `tenantPayment` por esse id.
 *
 * Incidente (23/10/2026, unidade `aprendereformar`): a linha saia com o id do
 * Asaas (`pay_...`), a baixa manual respondia 404 "Cobranca nao encontrada" e o
 * admin nao conseguia quitar a mensalidade. Valia para toda unidade com
 * assinatura no Asaas.
 */

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn() },
  student: { groupBy: vi.fn() },
  systemSettings: { findUnique: vi.fn() },
  referralCommission: { aggregate: vi.fn() },
  referralPayout: { aggregate: vi.fn() },
  referralMonthlyCommission: { aggregate: vi.fn() },
  tenantPayment: { updateMany: vi.fn(), upsert: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

const requireAdmin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin }))

const asaas = vi.hoisted(() => ({ getSubscription: vi.fn(), listPayments: vi.fn() }))
vi.mock("@/lib/asaas/client", () => asaas)

vi.mock("@/lib/referrals/effective-rule", () => ({
  resolveEffectiveCommission: () => ({ warnings: [] }),
  describeEffectiveCommission: () => "",
}))
vi.mock("@/lib/tenant/checkout-mode", () => ({ tenantCheckoutMode: () => "NONE" }))
vi.mock("@/lib/redis/tenant-cache", () => ({ invalidateTenant: vi.fn() }))
vi.mock("@/lib/webhooks-saida/unidade", () => ({
  emitUnidadeStatus: vi.fn(),
  emitUnidadePagamento: vi.fn(),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { GET } from "@/app/api/admin/revendedores/[id]/route"
import { adminGuardFor } from "@/test/admin-ctx"

const due = new Date("2026-10-23T00:00:00.000Z")

beforeEach(() => {
  vi.clearAllMocks()
  requireAdmin.mockImplementation(adminGuardFor().requireAdmin)
  db.tenant.findUnique.mockResolvedValue({
    id: "t1",
    status: "ACTIVE",
    planValue: 239,
    createdAt: due,
    asaasCustomerId: "cus_1",
    asaasSubscriptionId: "sub_1",
    tecnicaCourses: [],
    tenantPayments: [
      {
        id: "local-1",
        asaasPaymentId: "pay_1",
        amount: 239,
        billingType: "UNDEFINED",
        status: "PENDING",
        dueDate: due,
        paidAt: null,
        clientPaidAt: null,
        refundedAt: null,
        refundReason: null,
        refundProofUrl: null,
        invoiceUrl: null,
        bankSlipUrl: null,
      },
    ],
  })
  db.tenant.count.mockResolvedValue(0)
  db.student.groupBy.mockResolvedValue([])
  db.systemSettings.findUnique.mockResolvedValue(null)
  for (const agg of [
    db.referralCommission.aggregate,
    db.referralPayout.aggregate,
    db.referralMonthlyCommission.aggregate,
  ]) {
    agg.mockResolvedValue({ _sum: { amount: null } })
  }
  asaas.getSubscription.mockResolvedValue({ status: "ACTIVE", value: 239 })
  asaas.listPayments.mockResolvedValue({
    hasMore: false,
    data: [
      { id: "pay_1", value: 239, billingType: "UNDEFINED", status: "PENDING", dueDate: "2026-10-23" },
      { id: "pay_so_asaas", value: 239, billingType: "PIX", status: "PENDING", dueDate: "2026-11-23" },
    ],
  })
})

describe("GET /api/admin/revendedores/[id] — id das cobrancas", () => {
  it("linha vinda do Asaas carrega o id do banco; so-Asaas fica com o id de la", async () => {
    const res = await GET(new Request("http://x/api/admin/revendedores/t1"), {
      params: Promise.resolve({ id: "t1" }),
    })
    expect(res.status).toBe(200)
    const { data } = await res.json()
    const byAsaas = Object.fromEntries(
      data.payments.map((p: { asaasPaymentId: string; id: string }) => [p.asaasPaymentId, p.id]),
    )
    expect(byAsaas).toEqual({ pay_1: "local-1", pay_so_asaas: "pay_so_asaas" })
  })
})
