import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Registro do webhook na conta Asaas da unidade.
 *
 * Contexto: no Asaas o webhook é da CONTA — `notificationUrl` na cobrança é
 * ignorado. Enquanto o cadastro dependeu da unidade, nenhuma conta de revenda
 * em produção notificou uma única vez e toda venda por PIX/boleto ficou PENDING.
 * Estes testes travam o contrato do registro automático que substituiu isso.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { update: vi.fn() } },
}))
vi.mock("@/lib/crypto", () => ({
  encrypt: (s: string) => `enc(${s})`,
  decrypt: (s: string) => s.replace(/^enc\(|\)$/g, ""),
}))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))
vi.mock("@/lib/tenant/urls", () => ({
  asaasWebhookUrl: (slug?: string | null) =>
    slug
      ? `https://www.pmb.test/api/webhooks/asaas?tenant=${slug}`
      : "https://www.pmb.test/api/webhooks/asaas",
  appDomain: () => "pmb.test",
}))
vi.mock("./client", () => {
  // A classe precisa nascer DENTRO da factory: `vi.mock` é içado para o topo do
  // arquivo e não enxerga bindings declarados acima dele.
  class AsaasApiError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly errors: Array<{ code: string; description: string }> = [],
    ) {
      super(message)
      this.name = "AsaasApiError"
    }
  }
  return {
    AsaasApiError,
    listWebhooks: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    removeWebhookBackoff: vi.fn(),
    decryptTenantAsaasKey: (s: string) => s.replace(/^enc\(|\)$/g, ""),
  }
})

import { prisma } from "@/lib/prisma"
import {
  AsaasApiError,
  listWebhooks,
  createWebhook,
  updateWebhook,
  removeWebhookBackoff,
} from "./client"
import {
  ensureTenantAsaasWebhook,
  inspectTenantAsaasWebhook,
  RESELLER_WEBHOOK_EVENTS,
} from "./webhook-provision"

const p = prisma as unknown as { tenant: { update: ReturnType<typeof vi.fn> } }
const listMock = listWebhooks as unknown as ReturnType<typeof vi.fn>
const createMock = createWebhook as unknown as ReturnType<typeof vi.fn>
const updateMock = updateWebhook as unknown as ReturnType<typeof vi.fn>
const backoffMock = removeWebhookBackoff as unknown as ReturnType<typeof vi.fn>

const EXPECTED_URL = "https://www.pmb.test/api/webhooks/asaas?tenant=ceipro"

const tenant = {
  id: "t1",
  slug: "ceipro",
  asaasApiKey: "enc(chave-da-unidade)",
  notifyEmail: "dono@ceipro.com.br",
}

function webhookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wh_1",
    name: "Profissionaliza Mais Brasil",
    url: EXPECTED_URL,
    email: "dono@ceipro.com.br",
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    hasAuthToken: true,
    sendType: "NON_SEQUENTIALLY",
    penalizedRequestsCount: 0,
    events: RESELLER_WEBHOOK_EVENTS,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  p.tenant.update.mockResolvedValue({})
  createMock.mockResolvedValue(webhookRow())
  updateMock.mockResolvedValue(webhookRow())
  backoffMock.mockResolvedValue(undefined)
})

describe("ensureTenantAsaasWebhook", () => {
  it("conta sem webhook: cria apontando para a nossa URL com token forte e os eventos que processamos", async () => {
    listMock.mockResolvedValue({ data: [] })

    const result = await ensureTenantAsaasWebhook(tenant)

    expect(result).toMatchObject({ ok: true, created: true, url: EXPECTED_URL })
    expect(createMock).toHaveBeenCalledTimes(1)
    const [input, apiKey] = createMock.mock.calls[0]
    expect(apiKey).toBe("chave-da-unidade")
    expect(input).toMatchObject({
      url: EXPECTED_URL,
      enabled: true,
      interrupted: false,
      apiVersion: 3,
      events: RESELLER_WEBHOOK_EVENTS,
    })
    // O Asaas exige 32+ caracteres no authToken — o campo manual aceitava 8.
    expect(input.authToken.length).toBeGreaterThanOrEqual(32)
    // O token gravado é o MESMO que registramos lá, criptografado.
    expect(p.tenant.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { asaasWebhookToken: `enc(${input.authToken})` },
    })
  })

  it("webhook cadastrado à mão com a URL quase certa (apex em vez do www): corrige em vez de duplicar", async () => {
    listMock.mockResolvedValue({
      // O ?tenant= é DESTA unidade — só o host está errado, e nesse host toda
      // entrega toma 401. É o caso que o reparo existe para resolver.
      data: [
        webhookRow({
          id: "wh_9",
          url: "https://pmb.test/api/webhooks/asaas?tenant=ceipro",
        }),
      ],
    })

    const result = await ensureTenantAsaasWebhook(tenant)

    expect(result).toMatchObject({ ok: true, created: false })
    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      "wh_9",
      expect.objectContaining({ url: EXPECTED_URL }),
      "chave-da-unidade",
    )
  })

  it("conta compartilhada com a PMB: NÃO sequestra o webhook global (sem ?tenant=) — cria o seu ao lado", async () => {
    // Unidade PRÓPRIA da PMB usa a MESMA conta Asaas da matriz, de propósito,
    // para o dinheiro cair no mesmo caixa. Nessa conta o `listWebhooks` devolve
    // o webhook GLOBAL da PMB. Adotá-lo reescreveria a URL dele para
    // `?tenant=<slug>` e trocaria o authToken (a env ASAAS_WEBHOOK_TOKEN) por um
    // token gerado — a mensalidade da REDE INTEIRA pararia de processar.
    listMock.mockResolvedValue({
      data: [
        webhookRow({ id: "wh_global", url: "https://www.pmb.test/api/webhooks/asaas" }),
      ],
    })

    const result = await ensureTenantAsaasWebhook(tenant)

    expect(result).toMatchObject({ ok: true, created: true })
    expect(updateMock).not.toHaveBeenCalled()
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ url: EXPECTED_URL }),
      "chave-da-unidade",
    )
  })

  it("webhook de OUTRA unidade na mesma conta: não é adotado", async () => {
    listMock.mockResolvedValue({
      data: [
        webhookRow({
          id: "wh_outra",
          url: "https://www.pmb.test/api/webhooks/asaas?tenant=outraunidade",
        }),
      ],
    })

    const result = await ensureTenantAsaasWebhook(tenant)

    expect(result).toMatchObject({ ok: true, created: true })
    expect(updateMock).not.toHaveBeenCalled()
  })

  it("fila interrompida/penalizada: religa e tira do backoff", async () => {
    listMock.mockResolvedValue({
      data: [webhookRow({ interrupted: true, penalizedRequestsCount: 12 })],
    })

    await ensureTenantAsaasWebhook(tenant)

    expect(updateMock).toHaveBeenCalledWith(
      "wh_1",
      expect.objectContaining({ enabled: true, interrupted: false }),
      "chave-da-unidade",
    )
    // `interrupted: false` no PUT não desfaz a penalização — é um estado à parte.
    expect(backoffMock).toHaveBeenCalledWith("wh_1", "chave-da-unidade")
  })

  it("fila saudável: não chama removeBackoff à toa", async () => {
    listMock.mockResolvedValue({ data: [webhookRow()] })

    await ensureTenantAsaasWebhook(tenant)

    expect(backoffMock).not.toHaveBeenCalled()
  })

  it("API key sem permissão de configurar webhook: NO_PERMISSION e nada gravado", async () => {
    listMock.mockRejectedValue(new AsaasApiError("forbidden", 401))

    const result = await ensureTenantAsaasWebhook(tenant)

    expect(result).toMatchObject({ ok: false, code: "NO_PERMISSION" })
    expect(p.tenant.update).not.toHaveBeenCalled()
  })

  it("unidade sem API key: NOT_CONNECTED sem tocar no Asaas", async () => {
    const result = await ensureTenantAsaasWebhook({ ...tenant, asaasApiKey: null })

    expect(result).toMatchObject({ ok: false, code: "NOT_CONNECTED" })
    expect(listMock).not.toHaveBeenCalled()
  })

  it("registrou no Asaas mas o banco falhou: NÃO reporta sucesso (o token ficaria dessincronizado)", async () => {
    listMock.mockResolvedValue({ data: [] })
    p.tenant.update.mockRejectedValue(new Error("db down"))

    const result = await ensureTenantAsaasWebhook(tenant)

    expect(result).toMatchObject({ ok: false, code: "TOKEN_NOT_SAVED" })
  })
})

describe("inspectTenantAsaasWebhook", () => {
  it("webhook correto e ativo: healthy", async () => {
    listMock.mockResolvedValue({ data: [webhookRow()] })

    const status = await inspectTenantAsaasWebhook(tenant)

    expect(status).toMatchObject({
      configured: true,
      healthy: true,
      enabled: true,
      interrupted: false,
      missingEvents: [],
    })
  })

  it("URL divergente: NÃO conta como configurado (toda entrega tomaria 401)", async () => {
    listMock.mockResolvedValue({
      data: [webhookRow({ url: "https://www.pmb.test/api/webhooks/asaas" })],
    })

    const status = await inspectTenantAsaasWebhook(tenant)

    expect(status.configured).toBe(false)
    expect(status.healthy).toBe(false)
  })

  it("faltando PAYMENT_RECEIVED: configurado, mas não saudável", async () => {
    listMock.mockResolvedValue({
      data: [
        webhookRow({
          events: RESELLER_WEBHOOK_EVENTS.filter((e) => e !== "PAYMENT_RECEIVED"),
        }),
      ],
    })

    const status = await inspectTenantAsaasWebhook(tenant)

    expect(status.configured).toBe(true)
    expect(status.healthy).toBe(false)
    expect(status.missingEvents).toEqual(["PAYMENT_RECEIVED"])
  })

  it("fila interrompida: configurado, mas não saudável", async () => {
    listMock.mockResolvedValue({ data: [webhookRow({ interrupted: true })] })

    const status = await inspectTenantAsaasWebhook(tenant)

    expect(status.configured).toBe(true)
    expect(status.healthy).toBe(false)
    expect(status.interrupted).toBe(true)
  })

  it("conta inacessível: reporta indisponibilidade em vez de fingir que não existe", async () => {
    listMock.mockRejectedValue(new AsaasApiError("bad key", 401))

    const status = await inspectTenantAsaasWebhook(tenant)

    expect(status.unavailable?.code).toBe("NO_PERMISSION")
    expect(status.healthy).toBe(false)
  })
})
