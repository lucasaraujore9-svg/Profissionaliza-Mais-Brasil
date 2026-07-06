import { describe, it, expect } from "vitest"
import { studentPaymentTarget } from "./student-payment-link"

// Invariante coberto: o aluno logado sempre tem para onde pagar uma cobranca
// PENDENTE em aberto — inclusive revenda via Mercado Pago, que antes ficava sem
// nenhum botao por nao ter asaasInvoiceUrl.

const base = {
  status: "PENDING",
  id: "enr_123",
  gateway: "MP",
  tenantId: "tenant_1" as string | null,
  asaasInvoiceUrl: null as string | null,
  tenant: { status: "ACTIVE", mpPublicKey: "APP_USR-pub" } as
    | { status: string; mpPublicKey: string | null }
    | null,
}

describe("studentPaymentTarget", () => {
  it("retorna null para matricula nao pendente", () => {
    expect(studentPaymentTarget({ ...base, status: "ACTIVE" })).toBeNull()
    expect(studentPaymentTarget({ ...base, status: "CANCELLED" })).toBeNull()
  })

  it("revenda MP sem fatura: checkout transparente in-app (o bug corrigido)", () => {
    expect(studentPaymentTarget(base)).toEqual({
      href: "/aluno/comprar/pagar/enr_123",
      external: false,
    })
  })

  it("revenda com loja SUSPENSA não oferece checkout (evita 'Loja indisponível')", () => {
    expect(
      studentPaymentTarget({
        ...base,
        tenant: { status: "SUSPENDED", mpPublicKey: "APP_USR-pub" },
      }),
    ).toBeNull()
  })

  it("revenda MP sem mpPublicKey (legado Checkout Pro) não oferece checkout", () => {
    expect(
      studentPaymentTarget({
        ...base,
        tenant: { status: "ACTIVE", mpPublicKey: null },
      }),
    ).toBeNull()
  })

  it("revenda ASAAS sem fatura e loja ACTIVE: checkout in-app (Asaas não exige mpPublicKey)", () => {
    expect(
      studentPaymentTarget({
        ...base,
        gateway: "ASAAS",
        tenant: { status: "ACTIVE", mpPublicKey: null },
      }),
    ).toEqual({ href: "/aluno/comprar/pagar/enr_123", external: false })
  })

  it("revenda sem dados da loja carregados: defensivo, não oferece checkout", () => {
    expect(studentPaymentTarget({ ...base, tenant: null })).toBeNull()
  })

  it("revenda Asaas com fatura: usa a fatura direta em nova aba", () => {
    expect(
      studentPaymentTarget({
        ...base,
        gateway: "ASAAS",
        asaasInvoiceUrl: "https://asaas.com/i/rev",
      }),
    ).toEqual({ href: "https://asaas.com/i/rev", external: true })
  })

  it("PMB Asaas com fatura persistida: link direto da fatura (sem regressao)", () => {
    expect(
      studentPaymentTarget({
        ...base,
        gateway: "ASAAS",
        tenantId: null,
        asaasInvoiceUrl: "https://asaas.com/i/pmb",
      }),
    ).toEqual({ href: "https://asaas.com/i/pmb", external: true })
  })

  it("PMB Asaas sem fatura: tela de retomada da marca (/pagar/[id])", () => {
    expect(
      studentPaymentTarget({ ...base, gateway: "ASAAS", tenantId: null }),
    ).toEqual({ href: "/pagar/enr_123", external: false })
  })

  it("PMB MP sem link persistido: nao ha checkout reabrivel", () => {
    expect(
      studentPaymentTarget({ ...base, gateway: "MP", tenantId: null }),
    ).toBeNull()
  })

  it("a fatura Asaas tem prioridade mesmo em revenda (evita cobranca duplicada)", () => {
    // Revenda Asaas com fatura ja emitida deve mandar para a fatura, nao para o
    // checkout in-app que criaria uma nova cobranca.
    expect(
      studentPaymentTarget({
        ...base,
        gateway: "ASAAS",
        tenantId: "tenant_1",
        asaasInvoiceUrl: "https://asaas.com/i/rev2",
      }),
    ).toEqual({ href: "https://asaas.com/i/rev2", external: true })
  })
})
