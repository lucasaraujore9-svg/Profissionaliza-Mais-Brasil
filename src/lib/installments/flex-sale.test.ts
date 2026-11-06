import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const prisma = {
    enrollment: { findUnique: vi.fn(), update: vi.fn() },
    boletoInstallment: { createMany: vi.fn() },
  }
  return { prisma }
})
vi.mock("@/lib/enrollment/external-first-payment-server", () => ({
  registerExternalFirstPayment: vi.fn(),
}))
vi.mock("@/lib/asaas/client", () => ({ createInstallmentWithBoleto: vi.fn(), createPayment: vi.fn() }))
vi.mock("@/lib/mercadopago/client", () => ({ createPayment: vi.fn() }))

import { prisma } from "@/lib/prisma"
import { registerExternalFirstPayment } from "@/lib/enrollment/external-first-payment-server"
import * as asaas from "@/lib/asaas/client"
import * as mp from "@/lib/mercadopago/client"
import { createFlexPlan, flexSalePlan } from "./flex-sale"

const p = prisma as unknown as {
  enrollment: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  boletoInstallment: { createMany: ReturnType<typeof vi.fn> }
}

const tenant = { id: "t1", slug: "loja", plataformaVendedorId: null }
const schedule = {
  count: 3,
  installmentValue: 100.1,
  downPayment: 250,
  firstDueDate: new Date("2026-12-10T12:00:00Z"),
  saleDate: new Date("2026-11-06T12:00:00Z"),
}

beforeEach(() => {
  vi.clearAllMocks()
  p.enrollment.findUnique.mockResolvedValue({ id: "enr1", tenantId: "t1", gateway: "ASAAS" })
})

describe("createFlexPlan", () => {
  it("cria 4 linhas SCHEDULED, grava o total e não toca em gateway", async () => {
    const r = await createFlexPlan({ enrollmentId: "enr1", tenant, schedule })
    expect(r).toEqual({ rows: 4, total: 550.3 })
    const data = p.boletoInstallment.createMany.mock.calls[0][0].data
    expect(data).toHaveLength(4)
    expect(data.every((d: { status: string; gateway: string; tenantId: string }) =>
      d.status === "SCHEDULED" && d.gateway === "ASAAS" && d.tenantId === "t1")).toBe(true)
    expect(p.enrollment.update.mock.calls[0][0].data).toMatchObject({
      flexInstallments: true,
      flexHasDownPayment: true,
      installmentsTotal: 4,
      finalAmount: 550.3,
    })
    expect(registerExternalFirstPayment).not.toHaveBeenCalled()
    expect(asaas.createInstallmentWithBoleto).not.toHaveBeenCalled()
    expect(asaas.createPayment).not.toHaveBeenCalled()
    expect(mp.createPayment).not.toHaveBeenCalled()
  })

  it("paidBefore: linha 1 nasce PAID e a baixa externa usa o valor dela", async () => {
    const paidAt = new Date("2026-11-05T12:00:00Z")
    await createFlexPlan({ enrollmentId: "enr1", tenant, schedule, paidBefore: { paidAt } })
    const data = p.boletoInstallment.createMany.mock.calls[0][0].data
    expect(data[0]).toMatchObject({ number: 1, status: "PAID", paidAt })
    expect(data[1].status).toBe("SCHEDULED")
    expect(registerExternalFirstPayment).toHaveBeenCalledWith({
      tenant,
      enrollmentId: "enr1",
      gateway: "ASAAS",
      paymentType: "BOLETO_INSTALLMENT",
      amount: 250,
      paidAt,
    })
  })

  it("plano inválido lança sem gravar nada", async () => {
    await expect(
      createFlexPlan({ enrollmentId: "enr1", tenant, schedule: { ...schedule, count: 0 } }),
    ).rejects.toThrow()
    expect(p.boletoInstallment.createMany).not.toHaveBeenCalled()
    expect(p.enrollment.update).not.toHaveBeenCalled()
  })

  it("matrícula de outra unidade lança sem gravar nada", async () => {
    p.enrollment.findUnique.mockResolvedValue({ id: "enr1", tenantId: "outro", gateway: "ASAAS" })
    await expect(createFlexPlan({ enrollmentId: "enr1", tenant, schedule })).rejects.toThrow()
    expect(p.boletoInstallment.createMany).not.toHaveBeenCalled()
    expect(p.enrollment.update).not.toHaveBeenCalled()
  })
})

describe("flexSalePlan", () => {
  const now = new Date("2026-11-06T15:00:00Z")
  const p = { count: 3, installmentValue: 30, downPayment: 10, firstDueDate: "2026-12-06" }

  it("monta a agenda com a venda em `now` e sem paidBefore", () => {
    const r = flexSalePlan(p, undefined, now)
    expect(r).toEqual({
      schedule: {
        count: 3,
        installmentValue: 30,
        downPayment: 10,
        firstDueDate: new Date("2026-12-06T12:00:00Z"),
        saleDate: now,
      },
    })
  })

  it("1º vencimento no passado → erro; hoje passa", () => {
    expect(flexSalePlan({ ...p, firstDueDate: "2026-11-05" }, undefined, now)).toHaveProperty("error")
    expect(flexSalePlan({ ...p, firstDueDate: "2026-11-06" }, undefined, now)).toHaveProperty("schedule")
  })

  it("parcela abaixo do piso → erro", () => {
    expect(flexSalePlan({ ...p, installmentValue: 4 }, undefined, now)).toHaveProperty("error")
  })

  it("1ª paga fora: futura → erro; passada → paidBefore", () => {
    expect(flexSalePlan(p, "2026-11-07", now)).toHaveProperty("error")
    const r = flexSalePlan(p, "2026-11-01", now)
    expect(r).toMatchObject({ paidBefore: { paidAt: new Date("2026-11-01T12:00:00Z") } })
  })
})
