import { describe, it, expect, vi, beforeEach } from "vitest"

// O motor de lembretes é I/O de Prisma + notificação; mockamos os dois e
// dirigimos o cenário pelos retornos (mesmo padrão de referrals/monthly.test.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantPayment: { findMany: vi.fn() },
    tenantPaymentReminder: { createMany: vi.fn() },
  },
}))
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => null),
}))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})
vi.mock("@/lib/pmb-config", () => ({ PMB_TENANT_SLUG: "__pmb__" }))

import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { runTenantPaymentReminders, reminderCopy } from "./reminders"

type AnyMock = ReturnType<typeof vi.fn>

const db = prisma as unknown as {
  tenantPayment: { findMany: AnyMock }
  tenantPaymentReminder: { createMany: AnyMock }
}
const notify = createNotification as unknown as AnyMock

// 11:00 UTC = 08:00 BRT do dia 10/08/2026 (horário do cron).
const NOW = new Date("2026-08-10T11:00:00.000Z")

function charge(dueISO: string, id = "tp1") {
  return {
    id,
    amount: 209,
    dueDate: new Date(dueISO),
    tenantId: "tenant-1",
    tenant: { name: "Unidade Teste" },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.tenantPaymentReminder.createMany.mockResolvedValue({ count: 1 })
})

describe("runTenantPaymentReminders — janelas", () => {
  it("consulta os dias D-5, D-2 e D-0 no fuso do Brasil", async () => {
    db.tenantPayment.findMany.mockResolvedValue([])

    await runTenantPaymentReminders(NOW)

    const where = db.tenantPayment.findMany.mock.calls[0][0].where
    const windows = (where.OR as { dueDate: { gte: Date; lt: Date } }[]).map(
      (w) => [w.dueDate.gte.toISOString(), w.dueDate.lt.toISOString()],
    )
    // Cada janela é o dia inteiro [00:00, 24h), não uma igualdade exata.
    expect(windows).toEqual([
      ["2026-08-15T00:00:00.000Z", "2026-08-16T00:00:00.000Z"], // 5 dias antes
      ["2026-08-12T00:00:00.000Z", "2026-08-13T00:00:00.000Z"], // 2 dias antes
      ["2026-08-10T00:00:00.000Z", "2026-08-11T00:00:00.000Z"], // no dia
    ])
  })

  it("descarta linha fora das janelas que escape do filtro do banco", async () => {
    db.tenantPayment.findMany.mockResolvedValue([
      charge("2026-08-13T00:00:00.000Z", "tp-d3"), // 3 dias: nenhuma janela
    ])

    const result = await runTenantPaymentReminders(NOW)

    expect(result.sent).toBe(0)
    expect(db.tenantPaymentReminder.createMany).not.toHaveBeenCalled()
  })

  it("vencimento gravado com hora ainda cai na janela certa", async () => {
    db.tenantPayment.findMany.mockResolvedValue([
      charge("2026-08-12T13:45:00.000Z", "tp-hora"),
    ])

    const result = await runTenantPaymentReminders(NOW)

    expect(result.sent).toBe(1)
    expect(db.tenantPaymentReminder.createMany).toHaveBeenCalledWith({
      data: [{ tenantPaymentId: "tp-hora", offsetDays: 2 }],
      skipDuplicates: true,
    })
  })

  it("ignora cobrança quitada na mão e a mensalidade da própria PMB", async () => {
    db.tenantPayment.findMany.mockResolvedValue([])

    await runTenantPaymentReminders(NOW)

    const where = db.tenantPayment.findMany.mock.calls[0][0].where
    expect(where.markedPaidAt).toBeNull()
    expect(where.paidAt).toBeNull()
    expect(where.status).toEqual({ in: ["PENDING", "OVERDUE"] })
    expect(where.tenant).toEqual({ slug: { not: "__pmb__" } })
  })

  it("dispara um aviso por cobrança, com a janela correta", async () => {
    db.tenantPayment.findMany.mockResolvedValue([
      charge("2026-08-15T00:00:00.000Z", "tp-d5"),
      charge("2026-08-10T00:00:00.000Z", "tp-d0"),
    ])

    const result = await runTenantPaymentReminders(NOW)

    expect(result.sent).toBe(2)
    expect(db.tenantPaymentReminder.createMany).toHaveBeenNthCalledWith(1, {
      data: [{ tenantPaymentId: "tp-d5", offsetDays: 5 }],
      skipDuplicates: true,
    })
    expect(db.tenantPaymentReminder.createMany).toHaveBeenNthCalledWith(2, {
      data: [{ tenantPaymentId: "tp-d0", offsetDays: 0 }],
      skipDuplicates: true,
    })

    // Owner-only + link para a tela de cobranças da unidade.
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        audience: "TENANT",
        tenantId: "tenant-1",
        category: "tenant-billing",
        href: "/painel/cobrancas",
      }),
    )
  })
})

describe("runTenantPaymentReminders — idempotência", () => {
  it("não reenvia quando a janela já foi reivindicada (count=0)", async () => {
    db.tenantPayment.findMany.mockResolvedValue([charge("2026-08-12T00:00:00.000Z")])
    db.tenantPaymentReminder.createMany.mockResolvedValue({ count: 0 })

    const result = await runTenantPaymentReminders(NOW)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(notify).not.toHaveBeenCalled()
  })

  it("reivindica ANTES de notificar — uma corrida não gera aviso duplicado", async () => {
    db.tenantPayment.findMany.mockResolvedValue([charge("2026-08-12T00:00:00.000Z")])
    const order: string[] = []
    db.tenantPaymentReminder.createMany.mockImplementation(async () => {
      order.push("claim")
      return { count: 1 }
    })
    notify.mockImplementation(async () => {
      order.push("notify")
      return null
    })

    await runTenantPaymentReminders(NOW)

    expect(order).toEqual(["claim", "notify"])
  })

  it("falha em uma cobrança não impede as demais", async () => {
    db.tenantPayment.findMany.mockResolvedValue([
      charge("2026-08-15T00:00:00.000Z", "tp-a"),
      charge("2026-08-12T00:00:00.000Z", "tp-b"),
    ])
    db.tenantPaymentReminder.createMany
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockResolvedValueOnce({ count: 1 })

    const result = await runTenantPaymentReminders(NOW)

    expect(result.sent).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain("tp-a")
  })
})

describe("reminderCopy", () => {
  const due = new Date("2026-08-15T00:00:00.000Z")

  it("no dia do vencimento usa nível WARNING e diz 'hoje'", () => {
    const copy = reminderCopy(0, 209, due)
    expect(copy.level).toBe("WARNING")
    expect(copy.title).toContain("vence hoje")
  })

  it("formata a data do vencimento em UTC (não escorrega para 14/08)", () => {
    expect(reminderCopy(5, 209, due).body).toContain("15/08/2026")
  })

  it("mostra o valor em reais", () => {
    expect(reminderCopy(2, 209.9, due).title).toContain("209,90")
  })
})
