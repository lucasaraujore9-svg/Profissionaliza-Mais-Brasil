import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Guard de valor zero no núcleo do Checkout Transparente do MP.
 *
 * Cupom de 100% zera o `finalAmount`. O MP recusa `transaction_amount: 0`, então
 * a venda morria com a matrícula PENDING e o curso nunca liberado. A regra é:
 * valor zerado não vai a gateway — libera direto, como bolsa.
 *
 * Este arquivo existe para travar a regressão: se alguém remover o guard, o
 * teste falha porque `createPayment` volta a ser chamado.
 */

vi.mock("./client", () => ({
  createPayment: vi.fn(),
  createPreapproval: vi.fn(),
}))
vi.mock("./fulfillment", () => ({ fulfillFromMpPayment: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
  prisma: { enrollment: { update: vi.fn().mockResolvedValue({}) } },
}))
vi.mock("@/lib/checkout/free-enrollment", async (importOriginal) => ({
  // isFreeAmount fica real — é a regra sob teste.
  ...(await importOriginal<typeof import("@/lib/checkout/free-enrollment")>()),
  releaseFreeEnrollment: vi.fn().mockResolvedValue(undefined),
}))

import { createPayment, createPreapproval } from "./client"
import { releaseFreeEnrollment } from "@/lib/checkout/free-enrollment"
import {
  processTransparentMpPayment,
  type TransparentEnrollment,
  type TransparentCtx,
} from "./transparent-process"

const CTX: TransparentCtx = {
  accessToken: "TEST-token",
  fulfillTenant: {
    id: "tenant_1",
    slug: "revenda1",
    name: "Revenda 1",
    plataformaVendedorId: "vend_9",
    isPmbVitrine: false,
  },
  notificationUrl: "https://pmb.test/api/webhooks/mp?tenant=revenda1",
  subscriptionBackUrl: "https://revenda1.test/confirmacao",
}

function enrollment(
  overrides: Partial<TransparentEnrollment> = {},
): TransparentEnrollment {
  return {
    id: "enr_1",
    finalAmount: 0,
    paymentType: "ONE_TIME",
    installmentsTotal: null,
    externalReference: "enr_enr_1",
    courseNome: "Curso Teste",
    payerNome: "Aluno",
    payerEmail: "aluno@test.com",
    payerCpf: "12345678909",
    payerKind: "STUDENT",
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(releaseFreeEnrollment).mockResolvedValue(undefined)
})

describe("processTransparentMpPayment — valor zerado por cupom", () => {
  it("NÃO cria pagamento no MP quando o valor é zero", async () => {
    await processTransparentMpPayment(
      enrollment(),
      { payment_method_id: "pix" },
      CTX,
    )

    expect(createPayment).not.toHaveBeenCalled()
    expect(createPreapproval).not.toHaveBeenCalled()
  })

  it("libera a matrícula e devolve aprovado", async () => {
    const result = await processTransparentMpPayment(
      enrollment(),
      { payment_method_id: "pix" },
      CTX,
    )

    expect(releaseFreeEnrollment).toHaveBeenCalledWith(CTX.fulfillTenant, "enr_1")
    expect(result).toEqual({ kind: "approved", status: "approved" })
  })

  it("vale também para o mensal (assinatura de R$ 0 seria recusada)", async () => {
    const result = await processTransparentMpPayment(
      enrollment({ paymentType: "MONTHLY", installmentsTotal: 12 }),
      { payment_method_id: "master", token: "card_token" },
      CTX,
    )

    expect(createPreapproval).not.toHaveBeenCalled()
    expect(result).toEqual({ kind: "approved", status: "approved" })
  })

  it("libera mesmo sem e-mail do pagador — não há cobrança a fazer", async () => {
    const result = await processTransparentMpPayment(
      enrollment({ payerEmail: null }),
      { payment_method_id: "pix" },
      CTX,
    )

    expect(result).toEqual({ kind: "approved", status: "approved" })
  })

  it("valor cobrável segue o fluxo normal do gateway", async () => {
    vi.mocked(createPayment).mockResolvedValue({
      id: 123,
      status: "approved",
      status_detail: "accredited",
    } as never)

    const result = await processTransparentMpPayment(
      enrollment({ finalAmount: 99.9 }),
      { payment_method_id: "pix" },
      CTX,
    )

    expect(createPayment).toHaveBeenCalledWith(
      "TEST-token",
      expect.objectContaining({ transaction_amount: 99.9 }),
      expect.any(String),
    )
    expect(releaseFreeEnrollment).not.toHaveBeenCalled()
    expect(result).toEqual({ kind: "approved", status: "approved" })
  })
})
