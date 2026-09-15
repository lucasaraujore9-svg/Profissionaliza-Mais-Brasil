import { describe, it, expect } from "vitest"
import { studentPaymentTarget } from "./student-payment-link"

// Invariante coberto: o "Pagar agora" da area do aluno leva SEMPRE a uma pagina
// da propria plataforma.
//
// Inversao registrada (2026-09-14): antes a fatura do Asaas tinha prioridade,
// inclusive em revenda ("evita cobranca duplicada"), e abria em nova aba no
// site do Asaas. O checkout in-app passou a retomar a cobranca anterior, entao
// o motivo deixou de existir e a funcao nem recebe mais `asaasInvoiceUrl`.

const base = {
  status: "PENDING",
  id: "enr_123",
  gateway: "MP",
  paymentType: "ONE_TIME",
  tenantId: "tenant_1" as string | null,
  tenant: { status: "ACTIVE", mpPublicKey: "APP_USR-pub" } as
    | { status: string; mpPublicKey: string | null }
    | null,
}

describe("studentPaymentTarget", () => {
  it("retorna null para matricula nao pendente", () => {
    expect(studentPaymentTarget({ ...base, status: "ACTIVE" })).toBeNull()
    expect(studentPaymentTarget({ ...base, status: "CANCELLED" })).toBeNull()
  })

  it("revenda MP: checkout transparente in-app", () => {
    expect(studentPaymentTarget(base)).toEqual({
      href: "/aluno/comprar/pagar/enr_123",
      external: false,
    })
  })

  it("revenda Asaas: checkout in-app, nunca a fatura do Asaas", () => {
    expect(
      studentPaymentTarget({
        ...base,
        gateway: "ASAAS",
        tenant: { status: "ACTIVE", mpPublicKey: null },
      }),
    ).toEqual({ href: "/aluno/comprar/pagar/enr_123", external: false })
  })

  it("carne vai para as parcelas, nao para o checkout da compra inteira", () => {
    expect(
      studentPaymentTarget({ ...base, paymentType: "BOLETO_INSTALLMENT" }),
    ).toEqual({ href: "/aluno/pagamentos", external: false })
  })

  it("revenda com loja SUSPENSA não oferece checkout (evita 'Loja indisponível')", () => {
    expect(
      studentPaymentTarget({
        ...base,
        tenant: { status: "SUSPENDED", mpPublicKey: "APP_USR-pub" },
      }),
    ).toBeNull()
  })

  it("revenda MP sem mpPublicKey não oferece checkout", () => {
    expect(
      studentPaymentTarget({ ...base, tenant: { status: "ACTIVE", mpPublicKey: null } }),
    ).toBeNull()
  })

  it("revenda sem dados da loja carregados: defensivo, não oferece checkout", () => {
    expect(studentPaymentTarget({ ...base, tenant: null })).toBeNull()
  })

  it("PMB Asaas: tela de retomada da marca (/pagar/[id])", () => {
    expect(
      studentPaymentTarget({ ...base, gateway: "ASAAS", tenantId: null, tenant: null }),
    ).toEqual({ href: "/pagar/enr_123", external: false })
  })

  it("PMB MP: a mesma tela da marca, que renderiza o checkout do MP", () => {
    expect(studentPaymentTarget({ ...base, tenantId: null, tenant: null })).toEqual({
      href: "/pagar/enr_123",
      external: false,
    })
  })
})
