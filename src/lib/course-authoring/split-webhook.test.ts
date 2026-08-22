import { describe, expect, it, vi, beforeEach } from "vitest"

const paymentFindUnique = vi.fn()
const splitFindMany = vi.fn()
const splitUpdate = vi.fn()
const splitUpdateMany = vi.fn()
const createNotification = vi.fn().mockResolvedValue(null)

vi.mock("@/lib/prisma", () => ({
  prisma: {
    payment: { findUnique: (...a: unknown[]) => paymentFindUnique(...a) },
    courseSaleSplit: {
      findMany: (...a: unknown[]) => splitFindMany(...a),
      update: (...a: unknown[]) => splitUpdate(...a),
      updateMany: (...a: unknown[]) => splitUpdateMany(...a),
    },
  },
}))
vi.mock("@/lib/notifications", () => ({
  createNotification: (...a: unknown[]) => createNotification(...a),
}))

const { applySplitEvent, isSplitEvent, splitIdFromPayload } = await import("./split-webhook")

beforeEach(() => {
  paymentFindUnique.mockReset().mockResolvedValue({ id: "pay_1", tenantId: "t_vendedor" })
  splitFindMany.mockReset().mockResolvedValue([
    {
      id: "l_prod",
      role: "PRODUCER",
      asaasSplitId: "sp_prod",
      walletId: "w_prod",
      beneficiaryTenantId: "t_produtor",
    },
    {
      id: "l_pmb",
      role: "PLATFORM",
      asaasSplitId: null,
      walletId: "w_pmb",
      beneficiaryTenantId: null,
    },
  ])
  splitUpdate.mockReset().mockResolvedValue({})
  splitUpdateMany.mockReset().mockResolvedValue({ count: 0 })
  createNotification.mockClear()
})

describe("reconhecimento de evento", () => {
  it("os quatro eventos de split sao tratados", () => {
    expect(isSplitEvent("PAYMENT_SPLIT_DONE")).toBe(true)
    expect(isSplitEvent("PAYMENT_SPLIT_CANCELLED")).toBe(true)
    expect(isSplitEvent("PAYMENT_SPLIT_DIVERGENCE_BLOCK")).toBe(true)
    expect(isSplitEvent("PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED")).toBe(true)
    expect(isSplitEvent("PAYMENT_RECEIVED")).toBe(false)
  })

  it("o splitId vem de additionalInfo, nao da raiz", () => {
    expect(splitIdFromPayload({ additionalInfo: { splitId: "sp_1" } })).toBe("sp_1")
    expect(splitIdFromPayload({ splitId: "sp_1" })).toBeNull()
    expect(splitIdFromPayload(null)).toBeNull()
  })
})

describe("liquidacao de uma linha", () => {
  it("fecha o split identificado por splitId", async () => {
    await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: "sp_prod",
      tenantId: "t_vendedor",
    })
    expect(splitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l_prod" },
        data: expect.objectContaining({ status: "DONE" }),
      }),
    )
  })

  it("sem splitId, casa por carteira e CARIMBA o id que faltava", async () => {
    await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: null,
      tenantId: "t_vendedor",
      splits: [{ id: "sp_pmb", walletId: "w_pmb", status: "DONE", refusalReason: null }],
    })
    expect(splitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "l_pmb" },
        data: expect.objectContaining({ asaasSplitId: "sp_pmb", status: "DONE" }),
      }),
    )
  })

  it("split recusado grava o motivo, nao some", async () => {
    await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: null,
      tenantId: "t_vendedor",
      splits: [
        { id: "sp_pmb", walletId: "w_pmb", status: "REFUSED", refusalReason: "motivo x" },
      ],
    })
    expect(splitUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUSED", refusalReason: "motivo x" }),
      }),
    )
  })
})

describe("bloqueio por divergencia", () => {
  it("alerta o SUPER_ADMIN — o prazo de 2 dias uteis nao pode passar em silencio", async () => {
    const note = await applySplitEvent("PAYMENT_SPLIT_DIVERGENCE_BLOCK", {
      asaasPaymentId: "pay_asaas",
      splitId: null,
      tenantId: "t_vendedor",
    })
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "ROLE", roleTarget: "SUPER_ADMIN", level: "ERROR" }),
    )
    expect(note).toContain("bloqueado")
  })

  it("o alerta NAO tem category — nao pode ser silenciado por preferencia", async () => {
    await applySplitEvent("PAYMENT_SPLIT_DIVERGENCE_BLOCK", {
      asaasPaymentId: "pay_asaas",
      splitId: null,
      tenantId: "t_vendedor",
    })
    expect(createNotification.mock.calls[0][0]).not.toHaveProperty("category")
  })

  it("prazo expirado cancela as linhas pendentes e avisa que o produtor nao recebeu", async () => {
    await applySplitEvent("PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED", {
      asaasPaymentId: "pay_asaas",
      splitId: null,
      tenantId: "t_vendedor",
    })
    expect(splitUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING", "AWAITING_CREDIT"] },
        }),
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    )
    expect(createNotification).toHaveBeenCalled()
  })
})

describe("tolerancia", () => {
  it("cobranca sem rateio aqui nao e erro", async () => {
    paymentFindUnique.mockResolvedValue(null)
    const note = await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_de_mensalidade",
      splitId: "sp_1",
      tenantId: "t_vendedor",
    })
    expect(note).toContain("sem rateio")
    expect(splitUpdate).not.toHaveBeenCalled()
  })

  it("evento sem cobranca identificada nao consulta o banco", async () => {
    const note = await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: null,
      splitId: null,
      tenantId: "t_vendedor",
    })
    expect(note).toContain("sem cobranca")
    expect(paymentFindUnique).not.toHaveBeenCalled()
  })

  it("pagamento sem linhas de rateio nao explode", async () => {
    splitFindMany.mockResolvedValue([])
    const note = await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: "sp_1",
      tenantId: "t_vendedor",
    })
    expect(note).toContain("sem linhas")
  })

  it("erro de banco nao derruba o webhook — o extrato e best-effort", async () => {
    // `reseller-process.ts` RELANCA tudo: sem isolamento, uma falha aqui faz o
    // Asaas reentregar o evento que tambem libera o acesso do aluno.
    splitFindMany.mockRejectedValue(new Error("deadlock"))
    const note = await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: "sp_1",
      tenantId: "t_vendedor",
    })
    expect(note).toContain("falha")
  })
})

describe("isolamento entre contas", () => {
  it("evento de uma conta Asaas nao mexe no rateio de outra unidade", async () => {
    // `asaasPaymentId` e unico no nosso banco, mas quem manda o evento e uma
    // conta especifica. Sem a comparacao, o webhook da unidade A liquidava (ou
    // cancelava) as linhas de uma cobranca da unidade B.
    paymentFindUnique.mockResolvedValue({ id: "pay_1", tenantId: "t_outra" })
    const note = await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: "sp_prod",
      tenantId: "t_vendedor",
    })
    expect(note).toContain("nao pertence")
    expect(splitUpdate).not.toHaveBeenCalled()
    expect(splitUpdateMany).not.toHaveBeenCalled()
  })

  it("cobranca da conta-mae (tenantId null) casa com o webhook da PMB", async () => {
    paymentFindUnique.mockResolvedValue({ id: "pay_1", tenantId: null })
    const note = await applySplitEvent("PAYMENT_SPLIT_DONE", {
      asaasPaymentId: "pay_asaas",
      splitId: "sp_prod",
      tenantId: null,
    })
    expect(note).not.toContain("nao pertence")
    expect(splitUpdate).toHaveBeenCalled()
  })
})
