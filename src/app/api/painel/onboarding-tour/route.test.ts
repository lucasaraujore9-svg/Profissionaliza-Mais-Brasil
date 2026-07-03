import { describe, it, expect, vi, beforeEach } from "vitest"

// API-004: o endpoint passa a validar o corpo com Zod (400 em corpo
// ausente/malformado) em vez de assumir o default silenciosamente.
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { update: vi.fn() } },
}))
vi.mock("@/lib/auth/reseller-session", () => ({
  requireResellerSession: vi.fn(),
}))

import { prisma } from "@/lib/prisma"
import { requireResellerSession } from "@/lib/auth/reseller-session"
import { POST } from "./route"

const update = (prisma as unknown as { user: { update: ReturnType<typeof vi.fn> } }).user.update
const sessionMock = requireResellerSession as unknown as ReturnType<typeof vi.fn>

function req(raw?: string) {
  return new Request("http://x/api/painel/onboarding-tour", {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(raw !== undefined ? { body: raw } : {}),
  })
}

beforeEach(() => {
  update.mockReset()
  update.mockResolvedValue({})
  sessionMock.mockReset()
  sessionMock.mockResolvedValue({ userId: "u1" })
})

describe("painel/onboarding-tour — validação de corpo (API-004)", () => {
  it("não autenticado → 401 e não grava", async () => {
    sessionMock.mockResolvedValue(null)
    const res = await POST(req(JSON.stringify({ dontShowAgain: true })))
    expect(res.status).toBe(401)
    expect(update).not.toHaveBeenCalled()
  })

  it("corpo ausente/malformado → 400 e não grava", async () => {
    const res = await POST(req("não é json"))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it("corpo sem dontShowAgain booleano → 400", async () => {
    const res = await POST(req(JSON.stringify({})))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it("dontShowAgain=true → grava data", async () => {
    const res = await POST(req(JSON.stringify({ dontShowAgain: true })))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledTimes(1)
    expect(update.mock.calls[0][0].data.onboardingTourCompletedAt).toBeInstanceOf(Date)
  })

  it("dontShowAgain=false → limpa data (null)", async () => {
    const res = await POST(req(JSON.stringify({ dontShowAgain: false })))
    expect(res.status).toBe(200)
    expect(update.mock.calls[0][0].data.onboardingTourCompletedAt).toBeNull()
  })
})
