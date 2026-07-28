import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Prontidão do gateway de vendas da unidade — as travas que passaram a valer
 * quando o Asaas deixou de ser capability liberada pelo Admin Master.
 *
 * Duas regras estão sob teste aqui:
 *   1. Desconectar o Asaas só devolve o gateway ativo para o Mercado Pago
 *      quando o MP está REALMENTE pronto. Reverter incondicionalmente fazia a
 *      unidade que migrou para o Asaas (e nunca revogou o token antigo do MP)
 *      voltar a cobrar numa conta que ela considera desativada — o fallback
 *      silencioso que a REGRA DE OURO do checkout proíbe.
 *   2. Ativar o Asaas exige `asaasConnected`, que é o ÚNICO campo consultado
 *      por `tenantCheckoutMode`. Validar só as credenciais deixava o painel
 *      anunciar "Asaas ativo" enquanto toda a vitrine resolvia NONE.
 */
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock("@/lib/auth/painel-guard", () => ({ requirePainel: vi.fn() }))
// Devolve promise: a rota encadeia `.catch(swallow(...))` no retorno.
vi.mock("@/lib/redis/tenant-cache", () => ({
  invalidateTenant: vi.fn(async () => undefined),
}))
vi.mock("@/lib/crypto", () => ({ encrypt: (v: string) => `enc(${v})` }))

import { logAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { painelGuardOk } from "@/test/painel-ctx"

import { DELETE as asaasDisconnect } from "./connect-asaas/route"
import { PATCH as setSalesGateway } from "./sales-gateway/route"

const audit = logAudit as unknown as ReturnType<typeof vi.fn>
const p = prisma as unknown as {
  tenant: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
}
const painelGuard = requirePainel as unknown as ReturnType<typeof vi.fn>

const del = () => new Request("http://x", { method: "DELETE" })
const patch = (body: unknown) =>
  new Request("http://x", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })

/** Último `data` passado ao prisma.tenant.update. */
function lastUpdateData(): Record<string, unknown> {
  const call = p.tenant.update.mock.calls.at(-1) as [{ data: Record<string, unknown> }]
  return call[0].data
}

beforeEach(() => {
  vi.clearAllMocks()
  painelGuard.mockResolvedValue(painelGuardOk())
  p.tenant.update.mockResolvedValue({})
})

describe("desconectar o Asaas não força o Mercado Pago", () => {
  it("MP incompleto → mantém salesGateway e não cai na conta antiga", async () => {
    p.tenant.findUnique.mockResolvedValue({
      salesGateway: "ASAAS",
      // Token velho do MP ainda salvo, mas sem public key nem assinatura:
      // a unidade NÃO está pronta para transacionar pelo Mercado Pago.
      mpAccessToken: "enc-token-antigo",
      mpPublicKey: null,
      mpWebhookSecret: null,
    })

    const res = await asaasDisconnect(del())
    expect(res.status).toBe(200)

    const data = lastUpdateData()
    expect(data.asaasConnected).toBe(false)
    expect(data.asaasApiKey).toBeNull()
    // O ponto do teste: nada de `salesGateway` no update.
    expect(data).not.toHaveProperty("salesGateway")

    const json = (await res.json()) as { data: { salesGateway: string } }
    expect(json.data.salesGateway).toBe("ASAAS")
  })

  it("MP pronto (trinca completa) → volta para MP", async () => {
    p.tenant.findUnique.mockResolvedValue({
      salesGateway: "ASAAS",
      mpAccessToken: "enc-token",
      mpPublicKey: "pk",
      mpWebhookSecret: "enc-secret",
    })

    const res = await asaasDisconnect(del())
    expect(res.status).toBe(200)
    expect(lastUpdateData().salesGateway).toBe("MP")

    const json = (await res.json()) as { data: { salesGateway: string } }
    expect(json.data.salesGateway).toBe("MP")
  })
})

describe("ativar o gateway exige a mesma prontidão do checkout", () => {
  it("ASAAS com credenciais mas asaasConnected=false → 400, sem gravar", async () => {
    p.tenant.findUnique.mockResolvedValue({
      slug: "unidade",
      customDomain: null,
      asaasConnected: false,
      asaasApiKey: "enc-key",
      asaasWebhookToken: "enc-wh",
      mpAccessToken: null,
      mpPublicKey: null,
      mpWebhookSecret: null,
    })

    const res = await setSalesGateway(patch({ gateway: "ASAAS" }))
    expect(res.status).toBe(400)
    const json = (await res.json()) as { code: string }
    expect(json.code).toBe("ASAAS_NOT_CONFIGURED")
    expect(p.tenant.update).not.toHaveBeenCalled()
  })

  it("ASAAS pronto → grava e deixa trilha de auditoria da troca", async () => {
    p.tenant.findUnique.mockResolvedValue({
      slug: "unidade",
      customDomain: null,
      asaasConnected: true,
      asaasApiKey: "enc-key",
      asaasWebhookToken: "enc-wh",
      mpAccessToken: null,
      mpPublicKey: null,
      mpWebhookSecret: null,
    })

    const res = await setSalesGateway(patch({ gateway: "ASAAS" }))
    expect(res.status).toBe(200)
    expect(lastUpdateData().salesGateway).toBe("ASAAS")
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "tenant.gateway.switch",
        tenantId: "t1",
        payloadAfter: expect.objectContaining({ salesGateway: "ASAAS" }),
      }),
    )
  })
})
