import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import {
  resolveSalesCap,
  effectiveSalesCap,
  PMB_SALES_DEFAULT_CAP,
} from "./sales-cap"

const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>

describe("resolveSalesCap", () => {
  it("SUPER_ADMIN não tem cap (100), mesmo com maxDiscount setado", () => {
    expect(resolveSalesCap("SUPER_ADMIN")).toBe(100)
    expect(resolveSalesCap("SUPER_ADMIN", 10)).toBe(100)
  })

  it("PMB_SALES sem override cai no padrão da role (50)", () => {
    expect(resolveSalesCap("PMB_SALES")).toBe(PMB_SALES_DEFAULT_CAP)
    expect(resolveSalesCap("PMB_SALES", null)).toBe(PMB_SALES_DEFAULT_CAP)
  })

  it("PMB_SALES com override usa o valor individual", () => {
    expect(resolveSalesCap("PMB_SALES", 10)).toBe(10)
    expect(resolveSalesCap("PMB_SALES", 0)).toBe(0)
  })

  it("clampa override fora de [0, 100]", () => {
    expect(resolveSalesCap("PMB_SALES", 150)).toBe(100)
    expect(resolveSalesCap("PMB_SALES", -5)).toBe(0)
  })
})

describe("effectiveSalesCap", () => {
  it("não consulta o banco para papéis sem cap", async () => {
    expect(await effectiveSalesCap({ userId: "u1", role: "SUPER_ADMIN" })).toBe(100)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("lê User.maxDiscount do banco para PMB_SALES", async () => {
    findUnique.mockResolvedValue({ maxDiscount: 10 })
    expect(await effectiveSalesCap({ userId: "u1", role: "PMB_SALES" })).toBe(10)
  })

  it("usuário PMB_SALES inexistente ou sem override => padrão da role", async () => {
    findUnique.mockResolvedValue(null)
    expect(await effectiveSalesCap({ userId: "u1", role: "PMB_SALES" })).toBe(
      PMB_SALES_DEFAULT_CAP,
    )
  })
})
