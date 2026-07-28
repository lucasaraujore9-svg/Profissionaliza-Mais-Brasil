import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

// Caixa x apuracao: o financeiro pode ajustar o valor na hora de marcar o saque
// como pago. O ajuste altera SO o ReferralPayout (dinheiro que saiu); as
// comissoes vinculadas mantem o valor apurado pelo motor. Estes testes travam
// esse contrato — se alguem "consertar" reescrevendo o amount das comissoes,
// perdemos a evidencia do ajuste e o teste quebra.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/auth/admin-guard", () => ({ requireAdmin: vi.fn() }))
vi.mock("@/lib/referrals/payout", () => ({ markPayoutPaid: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    referralPayout: { findUnique: vi.fn(), update: vi.fn() },
    referralCommission: { update: vi.fn(), updateMany: vi.fn() },
    referralMonthlyCommission: { update: vi.fn(), updateMany: vi.fn() },
  },
}))

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { adminGuardFor } from "@/test/admin-ctx"
import { markPayoutPaid } from "@/lib/referrals/payout"

import { POST as markPaid } from "./[id]/mark-paid/route"

interface PayoutRow {
  id: string
  status: string
  notes: string | null
  amount: Prisma.Decimal
  proofUrl: string | null
}

const audit = logAudit as unknown as ReturnType<typeof vi.fn>
const guardMock = requireAdmin as unknown as ReturnType<typeof vi.fn>
const markPaidFn = markPayoutPaid as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as {
  referralPayout: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  referralCommission: {
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  referralMonthlyCommission: {
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
}

// Linha do payout em memoria: o update do route grava aqui e markPayoutPaid
// (mockado) le de volta, reproduzindo a ordem real "ajusta -> liquida".
let payoutRow: PayoutRow

const req = (body: unknown) =>
  new Request("http://x/api/admin/financeiro/referral-payouts/p1/mark-paid", {
    method: "POST",
    body: JSON.stringify(body),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  guardMock.mockImplementation(
    adminGuardFor({ userId: "u1", role: "PMB_FINANCEIRO" }).requireAdmin,
  )
  // Caso real de producao: comissao apurada R$ 23,90, saque pago R$ 75,00.
  payoutRow = {
    id: "p1",
    status: "REQUESTED",
    notes: null,
    amount: new Prisma.Decimal("23.90"),
    proofUrl: "https://storage/comprovante.pdf",
  }
  p.referralPayout.findUnique.mockImplementation(async () => payoutRow)
  p.referralPayout.update.mockImplementation(
    async ({ data }: { data: Partial<PayoutRow> }) => {
      payoutRow = { ...payoutRow, ...data }
      return payoutRow
    },
  )
  markPaidFn.mockImplementation(async (id: string) => ({
    ...payoutRow,
    id,
    status: "PAID",
  }))
})

describe("mark-paid — ajuste manual de valor (caixa x apuracao)", () => {
  it("ajuste grava no payout e NAO toca no amount das comissoes", async () => {
    const res = await markPaid(req({ amount: 75 }), ctx("p1"))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: { amount: number } }
    expect(json.data.amount).toBe(75)

    // Caixa: o payout passou a valer o que saiu do banco.
    expect(p.referralPayout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ amount: new Prisma.Decimal(75) }),
      }),
    )
    // Apuracao: nenhuma comissao foi reescrita para "fazer bater".
    expect(p.referralCommission.update).not.toHaveBeenCalled()
    expect(p.referralCommission.updateMany).not.toHaveBeenCalled()
    expect(p.referralMonthlyCommission.update).not.toHaveBeenCalled()
    expect(p.referralMonthlyCommission.updateMany).not.toHaveBeenCalled()
  })

  it("registra os dois valores no audit trail (apurado -> pago)", async () => {
    await markPaid(req({ amount: 119.5 }), ctx("p1"))

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "payout.mark_paid",
        resource: "ReferralPayout",
        resourceId: "p1",
        payloadBefore: expect.objectContaining({ amount: 23.9 }),
        payloadAfter: expect.objectContaining({
          amount: 119.5,
          amountAdjusted: true,
        }),
      }),
    )
  })

  it("deixa rastro do ajuste na nota do saque", async () => {
    await markPaid(req({ amount: 75 }), ctx("p1"))

    const notesCall = p.referralPayout.update.mock.calls.find(
      (call: unknown[]) =>
        typeof (call[0] as { data: { notes?: string } }).data.notes === "string",
    ) as [{ data: { notes: string } }] | undefined
    expect(notesCall?.[0].data.notes).toContain("Valor ajustado")
  })

  it("sem ajuste: o amount do payout nao e reescrito", async () => {
    const res = await markPaid(req({ note: "conferido" }), ctx("p1"))
    expect(res.status).toBe(200)

    const touchedAmount = p.referralPayout.update.mock.calls.some(
      (call: unknown[]) => "amount" in (call[0] as { data: object }).data,
    )
    expect(touchedAmount).toBe(false)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadBefore: expect.objectContaining({ amount: 23.9 }),
        payloadAfter: expect.objectContaining({
          amount: 23.9,
          amountAdjusted: false,
        }),
      }),
    )
  })

  it("valor identico ao atual nao conta como ajuste", async () => {
    await markPaid(req({ amount: 23.9 }), ctx("p1"))

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        payloadAfter: expect.objectContaining({ amountAdjusted: false }),
      }),
    )
  })
})

describe("mark-paid — gates", () => {
  it("sem comprovante anexado: 400 e nao liquida nada", async () => {
    payoutRow = { ...payoutRow, proofUrl: null }

    const res = await markPaid(req({ amount: 75 }), ctx("p1"))
    expect(res.status).toBe(400)
    expect(markPaidFn).not.toHaveBeenCalled()
    expect(p.referralPayout.update).not.toHaveBeenCalled()
  })

  it("saque ja pago: 409", async () => {
    payoutRow = { ...payoutRow, status: "PAID" }

    const res = await markPaid(req({ amount: 75 }), ctx("p1"))
    expect(res.status).toBe(409)
    expect(markPaidFn).not.toHaveBeenCalled()
  })

  it("papel sem permissao financeira: 403", async () => {
    guardMock.mockImplementation(
      adminGuardFor({ userId: "u9", role: "PMB_DESIGNER" }).requireAdmin,
    )

    const res = await markPaid(req({ amount: 75 }), ctx("p1"))
    expect(res.status).toBe(403)
    expect(markPaidFn).not.toHaveBeenCalled()
  })
})
