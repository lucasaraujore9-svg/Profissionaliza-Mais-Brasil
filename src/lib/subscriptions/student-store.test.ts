import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: { tenant: { findUnique: vi.fn() } } }))
vi.mock("@/lib/asaas/client", () => ({ decryptTenantAsaasKey: (v: string) => `dec(${v})` }))
vi.mock("@/lib/mercadopago/client", () => ({ decryptTenantMpToken: (v: string) => `dec(${v})` }))

import { prisma } from "@/lib/prisma"
import { resolveStudentSubscriptionStore } from "./student-store"

const findTenant = prisma.tenant.findUnique as unknown as ReturnType<typeof vi.fn>

const asaasTenant = {
  id: "t1",
  slug: "capacitaprobrasil",
  status: "ACTIVE",
  salesGateway: "ASAAS",
  asaasApiKey: "enc_key",
  asaasWebhookToken: "whk",
  mpAccessToken: null,
  mpPublicKey: null,
}

beforeEach(() => vi.clearAllMocks())

describe("resolveStudentSubscriptionStore", () => {
  it("aluno de revenda Asaas cobra na conta DA UNIDADE", async () => {
    findTenant.mockResolvedValue(asaasTenant)
    const store = await resolveStudentSubscriptionStore("t1")
    // Sem a chave da unidade, o assert de isolamento recusava e o aluno tomava 502.
    expect(store).toEqual({
      scopeTenantId: "t1",
      gateway: "ASAAS",
      account: { asaasApiKey: "dec(enc_key)", mpAccessToken: undefined, tenantSlug: "capacitaprobrasil" },
    })
  })

  it("placeholder __pmb__ é a vitrine PMB (escopo null), não uma revenda", async () => {
    findTenant.mockResolvedValue({ ...asaasTenant, id: "pmb", slug: "__pmb__" })
    expect(await resolveStudentSubscriptionStore("pmb")).toEqual({
      scopeTenantId: null,
      gateway: "ASAAS",
      account: {},
    })
  })

  it("unidade fora do ar não recebe pagamento", async () => {
    findTenant.mockResolvedValue({ ...asaasTenant, status: "SUSPENDED" })
    expect((await resolveStudentSubscriptionStore("t1")).gateway).toBe("NONE")
  })
})
