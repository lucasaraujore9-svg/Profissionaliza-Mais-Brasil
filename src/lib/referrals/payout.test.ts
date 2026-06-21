import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

// Mock do prisma: markPayoutPaid roda tudo dentro de prisma.$transaction(cb).
// Simulamos a transação invocando o callback com um `tx` fake controlado, do
// mesmo jeito que os outros testes que tocam prisma (ex.: pmb-tenant.test.ts).
vi.mock("@/lib/prisma", () => {
  const tx = {
    referralPayout: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    referralCommission: { count: vi.fn(), updateMany: vi.fn() },
    referralMonthlyCommission: { count: vi.fn(), updateMany: vi.fn() },
  }
  return {
    prisma: {
      __tx: tx,
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    },
  }
})

// Notificações são efeito colateral — não queremos disparar nada real no teste.
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { markPayoutPaid, ReferralPayoutError } from "./payout"

// Acesso ao `tx` fake injetado pelo mock acima.
const tx = (prisma as unknown as { __tx: {
  referralPayout: {
    findUnique: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    findUniqueOrThrow: ReturnType<typeof vi.fn>
  }
  referralCommission: { count: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }
  referralMonthlyCommission: { count: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }
} }).__tx

beforeEach(() => {
  tx.referralPayout.findUnique.mockReset()
  tx.referralPayout.updateMany.mockReset()
  tx.referralPayout.findUniqueOrThrow.mockReset()
  tx.referralCommission.count.mockReset()
  tx.referralCommission.updateMany.mockReset()
  tx.referralMonthlyCommission.count.mockReset()
  tx.referralMonthlyCommission.updateMany.mockReset()
})

describe("markPayoutPaid — gate de clawback no chokepoint (SAAS-005 follow-up)", () => {
  it("LANÇA CLAWBACK_FROZEN e NÃO liquida quando o payout tem comissão congelada", async () => {
    // Payout REQUESTED, com comprovante (passa pelo PROOF_REQUIRED), pronto p/ pagar.
    tx.referralPayout.findUnique.mockResolvedValue({
      id: "p1",
      status: "REQUESTED",
      amount: new Prisma.Decimal(100),
      asaasTransferId: null,
      processedAt: null,
      referrerTenantId: "t1",
      proofUrl: "https://comprovante",
    })
    // Uma comissão legada vinculada ao payout carrega o marcador de clawback
    // (foi congelada por refund parcial DEPOIS que o payout foi criado).
    tx.referralCommission.count.mockResolvedValue(1)
    tx.referralMonthlyCommission.count.mockResolvedValue(0)

    await expect(markPayoutPaid("p1")).rejects.toMatchObject({
      name: "ReferralPayoutError",
      code: "CLAWBACK_FROZEN",
    })

    // O vazamento: as comissões NÃO podem ter sido marcadas como PAID, e o
    // payout NÃO pode ter sido marcado como PAID.
    expect(tx.referralPayout.updateMany).not.toHaveBeenCalled()
    expect(tx.referralCommission.updateMany).not.toHaveBeenCalled()
    expect(tx.referralMonthlyCommission.updateMany).not.toHaveBeenCalled()
  })

  it("também bloqueia quando a comissão congelada é do motor mensal por faixas", async () => {
    tx.referralPayout.findUnique.mockResolvedValue({
      id: "p2",
      status: "REQUESTED",
      amount: new Prisma.Decimal(80),
      asaasTransferId: null,
      processedAt: null,
      referrerTenantId: "t1",
      proofUrl: "https://comprovante",
    })
    tx.referralCommission.count.mockResolvedValue(0)
    tx.referralMonthlyCommission.count.mockResolvedValue(2)

    await expect(markPayoutPaid("p2")).rejects.toBeInstanceOf(ReferralPayoutError)
    expect(tx.referralPayout.updateMany).not.toHaveBeenCalled()
  })

  it("paga normalmente quando NÃO há comissão congelada", async () => {
    tx.referralPayout.findUnique.mockResolvedValue({
      id: "p3",
      status: "REQUESTED",
      amount: new Prisma.Decimal(120),
      asaasTransferId: null,
      processedAt: null,
      referrerTenantId: "t1",
      proofUrl: "https://comprovante",
    })
    tx.referralCommission.count.mockResolvedValue(0)
    tx.referralMonthlyCommission.count.mockResolvedValue(0)
    tx.referralPayout.updateMany.mockResolvedValue({ count: 1 })
    tx.referralCommission.updateMany.mockResolvedValue({ count: 1 })
    tx.referralMonthlyCommission.updateMany.mockResolvedValue({ count: 0 })
    tx.referralPayout.findUniqueOrThrow.mockResolvedValue({ id: "p3", status: "PAID" })

    const out = await markPayoutPaid("p3")
    expect(out).toMatchObject({ id: "p3", status: "PAID" })
    expect(tx.referralCommission.updateMany).toHaveBeenCalledWith({
      where: { payoutId: "p3" },
      data: expect.objectContaining({ status: "PAID" }),
    })
  })

  it("idempotência: payout JÁ PAID não checa clawback (re-chamada é no-op)", async () => {
    tx.referralPayout.findUnique.mockResolvedValue({
      id: "p4",
      status: "PAID",
      amount: new Prisma.Decimal(50),
      asaasTransferId: null,
      processedAt: new Date(),
      referrerTenantId: "t1",
      proofUrl: "https://comprovante",
    })
    tx.referralPayout.updateMany.mockResolvedValue({ count: 0 })
    tx.referralPayout.findUniqueOrThrow.mockResolvedValue({ id: "p4", status: "PAID" })

    const out = await markPayoutPaid("p4")
    expect(out).toMatchObject({ id: "p4", status: "PAID" })
    // Não deve nem consultar o marcador num payout já pago.
    expect(tx.referralCommission.count).not.toHaveBeenCalled()
    expect(tx.referralMonthlyCommission.count).not.toHaveBeenCalled()
  })
})
