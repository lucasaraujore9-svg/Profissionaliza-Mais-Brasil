import { describe, it, expect, vi, beforeEach } from "vitest"

// SAAS-001: prova que a gestão da equipe da unidade (maxDiscount/deactivate) e a
// conexão/desconexão dos gateways (MP/Asaas) gravam trilha de auditoria — e que
// os payloads de gateway NUNCA incluem credenciais.
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: vi.fn(), update: vi.fn() },
    tenantMember: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))
vi.mock("@/lib/auth/guards", () => ({ requireResellerOwner: vi.fn() }))
// As rotas de gateway passaram a exigir a permissao `gateway.manage`; o guard
// consulta prisma.user/tenantMember, fora deste mock parcial de Prisma.
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc(${v})` }))
vi.mock("@/lib/mercadopago/client", () => {
  class MPApiError extends Error {
    statusCode: number
    constructor(m: string, s: number) {
      super(m)
      this.statusCode = s
    }
  }
  return {
    getAccountInfo: vi.fn(async () => ({ id: 999, site_id: "MLB" })),
    MPApiError,
  }
})

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireResellerOwner } from "@/lib/auth/guards"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"

import { PATCH as equipePatch, DELETE as equipeDelete } from "./equipe/[id]/route"
import { POST as mpConnect, DELETE as mpDisconnect } from "./config/connect-mp/route"
import { POST as asaasConnect, DELETE as asaasDisconnect } from "./config/connect-asaas/route"

const audit = logAudit as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  tenantMember: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const authMock = auth as unknown as ReturnType<typeof vi.fn>
const ownerGuard = requireResellerOwner as unknown as ReturnType<typeof vi.fn>
const painelGuard = requirePainel as unknown as ReturnType<typeof vi.fn>

function jreq(body: unknown) {
  return new Request("http://x", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  authMock.mockResolvedValue({
    user: { id: "u1", role: "RESELLER", tenantId: "t1" },
  })
  ownerGuard.mockResolvedValue({ ok: true, session: { userId: "u1", role: "RESELLER" } })
  painelGuard.mockResolvedValue(painelGuardOk())
  p.tenant.update.mockResolvedValue({})
})

describe("SAAS-001 — audit trail em equipe e gateways da unidade", () => {
  it("equipe PATCH → tenant_member.update", async () => {
    p.tenantMember.findUnique.mockResolvedValue({ id: "m1", tenantId: "t1", maxDiscount: 10, status: "ATIVO" })
    p.tenantMember.update.mockResolvedValue({ id: "m1" })
    const res = await equipePatch(jreq({ maxDiscount: 20 }), params("m1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant_member.update", tenantId: "t1" }))
  })

  it("equipe DELETE → tenant_member.deactivate", async () => {
    p.tenantMember.findUnique.mockResolvedValue({ id: "m1", tenantId: "t1", maxDiscount: 10, status: "ATIVO" })
    p.tenantMember.update.mockResolvedValue({ id: "m1" })
    const res = await equipeDelete(new Request("http://x", { method: "DELETE" }), params("m1"))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant_member.deactivate" }))
  })

  it("MP connect → tenant.gateway.connect sem credencial no payload", async () => {
    const res = await mpConnect(jreq({ accessToken: "APP_USR-super-secret-token" }))
    expect(res.status).toBe(200)
    const call = audit.mock.calls.find((c) => c[0].action === "tenant.gateway.connect")
    expect(call).toBeTruthy()
    expect(call?.[0].payloadAfter.gateway).toBe("MP")
    expect(JSON.stringify(call?.[0])).not.toContain("APP_USR-super-secret-token")
  })

  it("MP disconnect → tenant.gateway.disconnect", async () => {
    const res = await mpDisconnect(new Request("http://x", { method: "DELETE" }))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.gateway.disconnect" }))
  })

  it("Asaas connect → tenant.gateway.connect sem credencial no payload", async () => {
    p.tenant.findUnique.mockResolvedValue({ asaasGatewayEnabled: true, asaasApiKey: null })
    const res = await asaasConnect(jreq({ apiKey: "asaas-secret-api-key-123" }))
    expect(res.status).toBe(200)
    const call = audit.mock.calls.find(
      (c) => c[0].action === "tenant.gateway.connect" && c[0].payloadAfter.gateway === "ASAAS",
    )
    expect(call).toBeTruthy()
    expect(JSON.stringify(call?.[0])).not.toContain("asaas-secret-api-key-123")
  })

  it("Asaas disconnect → tenant.gateway.disconnect", async () => {
    const res = await asaasDisconnect(new Request("http://x", { method: "DELETE" }))
    expect(res.status).toBe(200)
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.gateway.disconnect", payloadAfter: expect.objectContaining({ gateway: "ASAAS" }) }),
    )
  })
})
