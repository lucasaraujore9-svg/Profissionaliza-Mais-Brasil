import { describe, expect, it, vi, beforeEach } from "vitest"

const findUnique = vi.fn()
vi.mock("@/lib/prisma", () => ({
  prisma: { tenant: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}))
// Parcial de proposito: so `getPlatformWalletId` fala com a rede. O
// `canSellAuthoredCourse` entra REAL — reimplementa-lo aqui criaria a terceira
// copia da regra que o gate acabou de parar de duplicar.
vi.mock("./wallet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./wallet")>()),
  getPlatformWalletId: async () => "wallet-pmb",
}))

const { authoredSaleGate } = await import("./checkout-gate")

const PRODUCER = "tenant_produtor"
const SELLER = "tenant_vendedor"

type Course = Parameters<typeof authoredSaleGate>[0]["courses"][number]

function pmbCourse(id = "c_pmb"): Course {
  return {
    id,
    nome: "Curso PMB",
    provider: "EA",
    plataformaCourseId: "267",
    lmsCourseId: null,
    authorTenantId: null,
    authoredStatus: null,
    distribution: "OWN_ONLY",
    pricingMode: "FIXED",
    authorAmount: null,
    sellerCommissionPercent: null,
    platformFeePercent: null,
  } as unknown as Course
}

function authoredCourse(over: Partial<Record<string, unknown>> = {}): Course {
  return {
    id: "c_autoral",
    nome: "Curso Autoral",
    provider: "LMS",
    plataformaCourseId: null,
    lmsCourseId: "lms_c_autoral",
    authorTenantId: PRODUCER,
    authoredStatus: "PUBLISHED",
    distribution: "NETWORK",
    pricingMode: "FIXED",
    authorAmount: 200,
    sellerCommissionPercent: 20,
    platformFeePercent: 5,
    ...over,
  } as unknown as Course
}

const connectedSeller = { asaasConnected: true, asaasWebhookToken: "tok" }

beforeEach(() => {
  findUnique.mockReset()
  findUnique.mockResolvedValue({ asaasWalletId: "wallet-produtor" })
})

describe("venda sem rateio", () => {
  it("curso da PMB passa direto e nao força gateway", async () => {
    const res = await authoredSaleGate({
      courses: [pmbCourse()],
      sellerTenantId: SELLER,
      seller: { asaasConnected: false, asaasWebhookToken: null },
      listPrice: 100,
    })
    expect(res).toEqual({ ok: true, split: null, forcedGateway: null })
  })

  it("autor vendendo na propria loja nao gera rateio nem exige Asaas", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: PRODUCER,
      seller: { asaasConnected: false, asaasWebhookToken: null },
      listPrice: 200,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.split).toBeNull()
      expect(res.forcedGateway).toBeNull()
    }
  })
})

describe("venda com rateio", () => {
  it("força ASAAS mesmo que a unidade esteja no Mercado Pago", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 200,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.forcedGateway).toBe("ASAAS")
      expect(res.split?.lines).toHaveLength(3)
    }
  })

  it("recusa a venda quando a loja nao tem Asaas — nunca cai no MP sem repasse", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: SELLER,
      seller: { asaasConnected: false, asaasWebhookToken: null },
      listPrice: 200,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(503)
      await expect(res.response.json()).resolves.toMatchObject({
        code: "SPLIT_GATEWAY_REQUIRED",
      })
    }
  })

  it("recusa quando a conta Asaas esta conectada mas sem token de webhook", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: SELLER,
      seller: { asaasConnected: true, asaasWebhookToken: null },
      listPrice: 200,
    })
    expect(res.ok).toBe(false)
  })

  it("a PMB vende sem precisar de conta conectada (ela é a conta-mãe)", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: null,
      seller: null,
      listPrice: 200,
    })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.forcedGateway).toBe("ASAAS")
  })
})

describe("travas de composicao da venda", () => {
  it("curso de terceiro nao entra em carrinho misto", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse(), pmbCourse()],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 300,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      await expect(res.response.json()).resolves.toMatchObject({
        code: "AUTHORED_COURSE_ALONE",
      })
    }
  })

  it("dois cursos de autoria na mesma venda tambem sao recusados", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse(), authoredCourse({ id: "c2" })],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 400,
    })
    expect(res.ok).toBe(false)
  })
})

describe("concessao gratuita", () => {
  it("bolsa de curso de terceiro e recusada — o produtor nao receberia nada", async () => {
    // O resto do gate olha gateway, carteira e preco: uma venda de valor zero
    // passa pelos tres. Sem `freeGrant`, marcar "bolsista" entregava de graca o
    // produto de outra unidade, sem cobranca, sem split e sem registro.
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 200,
      freeGrant: true,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      await expect(res.response.json()).resolves.toMatchObject({
        code: "AUTHORED_COURSE_NO_FREE_GRANT",
      })
    }
  })

  it("bolsa de curso da PMB continua passando", async () => {
    const res = await authoredSaleGate({
      courses: [pmbCourse()],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 200,
      freeGrant: true,
    })
    expect(res).toEqual({ ok: true, split: null, forcedGateway: null })
  })

  it("o autor pode dar bolsa do PROPRIO curso na loja dele", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: PRODUCER,
      seller: connectedSeller,
      listPrice: 200,
      freeGrant: true,
    })
    expect(res.ok).toBe(true)
  })
})

describe("estado do curso e das carteiras", () => {
  it("curso pausado pelo /admin nao vende em vitrine de terceiro", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse({ authoredStatus: "PAUSED" })],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 200,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.response.status).toBe(400)
  })

  it("produtor sem carteira bloqueia a venda com 503, nao com 400", async () => {
    findUnique.mockResolvedValue({ asaasWalletId: null })
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 200,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(503)
      await expect(res.response.json()).resolves.toMatchObject({
        code: "PRODUCER_WALLET_MISSING",
      })
    }
  })

  it("preco fora do que o produtor definiu e recusado", async () => {
    const res = await authoredSaleGate({
      courses: [authoredCourse()],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 999,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.response.status).toBe(400)
      await expect(res.response.json()).resolves.toMatchObject({
        code: "PRICE_MUST_MATCH_FIXED",
      })
    }
  })
})

/**
 * Curso sem identificador da fornecedora não é matriculável. O gate mora AQUI —
 * e não numa rota — pela mesma lição do `GUARDIAN_REQUIRED`: as oito portas de
 * venda passam por `authoredSaleGate`, então porta nova herda a regra sem ter
 * que lembrar dela.
 *
 * Sem este gate, a venda acontece, o aluno é cobrado e o provisionamento morre
 * no fim do fluxo com "Falha ao matricular o aluno na plataforma de aulas" —
 * e "tente novamente" é um conselho que nunca funciona.
 */
describe("curso não matriculável na plataforma de aulas", () => {
  it("curso EA sem plataformaCourseId é recusado com 409, antes de qualquer cobrança", async () => {
    const res = await authoredSaleGate({
      courses: [{ ...pmbCourse("c_orfao"), plataformaCourseId: null }] as Course[],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 700,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.response.status).toBe(409)
    const json = (await res.response.json()) as { code: string; error: string }
    expect(json.code).toBe("COURSE_NOT_PROVISIONABLE")
    expect(json.error).toContain("Curso PMB")
  })

  it("curso LMS sem lmsCourseId também é recusado", async () => {
    const res = await authoredSaleGate({
      courses: [{ ...authoredCourse(), lmsCourseId: null }] as Course[],
      sellerTenantId: PRODUCER,
      seller: connectedSeller,
      listPrice: 200,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.response.status).toBe(409)
  })

  it("recusa a venda MULTI-CURSO quando o defeito está no 2º curso, não no 1º", async () => {
    const res = await authoredSaleGate({
      courses: [
        pmbCourse("c_ok"),
        { ...pmbCourse("c_orfao"), nome: "Corretor de Imóveis", plataformaCourseId: null },
      ] as Course[],
      sellerTenantId: SELLER,
      seller: connectedSeller,
      listPrice: 800,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    const json = (await res.response.json()) as { error: string }
    expect(json.error).toContain("Corretor de Imóveis")
  })

  it("o gate roda ANTES do de rateio — curso de terceiro sem id não vira 503 de carteira", async () => {
    const res = await authoredSaleGate({
      courses: [{ ...authoredCourse(), lmsCourseId: null }] as Course[],
      sellerTenantId: SELLER,
      // Loja SEM Asaas: sem a ordem certa isto responderia SPLIT_GATEWAY_REQUIRED
      // e esconderia o defeito real (o curso não tem como ser matriculado).
      seller: { asaasConnected: false, asaasWebhookToken: null },
      listPrice: 200,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    const json = (await res.response.json()) as { code: string }
    expect(json.code).toBe("COURSE_NOT_PROVISIONABLE")
  })
})
