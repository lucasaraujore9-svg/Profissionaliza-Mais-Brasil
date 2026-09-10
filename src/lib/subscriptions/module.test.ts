import { describe, expect, it, vi, beforeEach } from "vitest"

const tenantFindUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) } },
}))

const { isSubscriptionModuleEnabled } = await import("./module")

beforeEach(() => {
  tenantFindUnique.mockReset().mockResolvedValue({ subscriptionsEnabled: true })
})

describe("isSubscriptionModuleEnabled", () => {
  it("le a coluna da unidade", async () => {
    await expect(isSubscriptionModuleEnabled("t1")).resolves.toBe(true)
    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { id: "t1" },
      select: { subscriptionsEnabled: true },
    })
  })

  it("unidade com o modulo desligado nao vende", async () => {
    tenantFindUnique.mockResolvedValue({ subscriptionsEnabled: false })
    await expect(isSubscriptionModuleEnabled("t1")).resolves.toBe(false)
  })

  it("unidade inexistente e fail-closed", async () => {
    tenantFindUnique.mockResolvedValue(null)
    await expect(isSubscriptionModuleEnabled("t1")).resolves.toBe(false)
  })

  it("a vitrine da PMB (null) nao depende de habilitacao — e a dona do produto", async () => {
    // O modulo e por REVENDA. Aplicado a vitrine mae, a PMB perderia o proprio
    // produto ao nascer desligado.
    await expect(isSubscriptionModuleEnabled(null)).resolves.toBe(true)
    expect(tenantFindUnique).not.toHaveBeenCalled()
  })
})
