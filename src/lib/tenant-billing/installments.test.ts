import { describe, it, expect } from "vitest"
import {
  ASAAS_MAX_INSTALLMENTS,
  isFirstMonthlyCharge,
  maxInstallmentsForCharge,
  postCaptureTransition,
  type InstallmentPolicyInput,
} from "./installments"

const base: InstallmentPolicyInput = {
  tenantStatus: "ACTIVE",
  firstPaymentMaxInstallments: 1,
  monthlyMaxInstallments: null,
  globalMonthlyMaxInstallments: 12,
}

describe("isFirstMonthlyCharge", () => {
  it("so PENDING conta como 1a mensalidade", () => {
    expect(isFirstMonthlyCharge("PENDING")).toBe(true)
    for (const s of ["ACTIVE", "SUSPENDED", "CANCELLED", "DELETED"]) {
      expect(isFirstMonthlyCharge(s)).toBe(false)
    }
  })
})

describe("maxInstallmentsForCharge", () => {
  it("1a mensalidade usa o teto da unidade, nao o global", () => {
    // O ponto da separacao: o global e 12, mas a entrada foi vendida a vista.
    expect(
      maxInstallmentsForCharge({
        ...base,
        tenantStatus: "PENDING",
        firstPaymentMaxInstallments: 1,
        globalMonthlyMaxInstallments: 12,
      }),
    ).toBe(1)

    expect(
      maxInstallmentsForCharge({
        ...base,
        tenantStatus: "PENDING",
        firstPaymentMaxInstallments: 6,
      }),
    ).toBe(6)
  })

  it("demais mensalidades caem no padrao global quando a unidade nao tem override", () => {
    // E a regressao que o recurso inteiro existe para corrigir: unidade ACTIVE
    // com o campo da 1a mensalidade em 1 tinha que continuar sem parcelamento.
    expect(maxInstallmentsForCharge({ ...base, tenantStatus: "ACTIVE" })).toBe(12)
    expect(maxInstallmentsForCharge({ ...base, tenantStatus: "SUSPENDED" })).toBe(12)
  })

  it("override da unidade vence o padrao global", () => {
    expect(
      maxInstallmentsForCharge({ ...base, monthlyMaxInstallments: 3 }),
    ).toBe(3)
    // Inclusive para DESLIGAR o parcelamento so nesta unidade.
    expect(
      maxInstallmentsForCharge({ ...base, monthlyMaxInstallments: 1 }),
    ).toBe(1)
  })

  it("override 0/negativo nao vira parcelamento invalido", () => {
    expect(maxInstallmentsForCharge({ ...base, monthlyMaxInstallments: 0 })).toBe(1)
    expect(maxInstallmentsForCharge({ ...base, monthlyMaxInstallments: -5 })).toBe(1)
  })

  it("nunca oferece acima do teto do Asaas", () => {
    expect(
      maxInstallmentsForCharge({ ...base, monthlyMaxInstallments: 99 }),
    ).toBe(ASAAS_MAX_INSTALLMENTS)
    expect(
      maxInstallmentsForCharge({
        ...base,
        tenantStatus: "PENDING",
        firstPaymentMaxInstallments: 99,
      }),
    ).toBe(ASAAS_MAX_INSTALLMENTS)
  })

  it("valor nao-finito cai em 1x em vez de propagar NaN para a tela", () => {
    expect(
      maxInstallmentsForCharge({
        ...base,
        monthlyMaxInstallments: Number.NaN,
      }),
    ).toBe(1)
  })

  it("trunca fracionario", () => {
    expect(
      maxInstallmentsForCharge({ ...base, monthlyMaxInstallments: 6.9 }),
    ).toBe(6)
  })
})

describe("postCaptureTransition", () => {
  it("PENDING ativa a unidade sem mexer nos alunos", () => {
    // Unidade nova nao tem aluno bloqueado por suspensao — desbloquear seria
    // escrita inutil na plataforma de aulas.
    expect(postCaptureTransition("PENDING")).toEqual({
      activate: true,
      unblockStudents: false,
    })
  })

  it("SUSPENDED ativa E desbloqueia os alunos", () => {
    // Sem isto a unidade paga a mensalidade atrasada parcelada e os alunos dela
    // continuam bloqueados na plataforma de aulas.
    expect(postCaptureTransition("SUSPENDED")).toEqual({
      activate: true,
      unblockStudents: true,
    })
  })

  it("ACTIVE nao promove nem toca nos alunos", () => {
    // Decide pelo status de ORIGEM: reativar quem ja esta ativo mascararia um
    // bloqueio manual legitimo de aluno.
    expect(postCaptureTransition("ACTIVE")).toEqual({
      activate: false,
      unblockStudents: false,
    })
  })

  it("status desconhecido nao promove (fail-closed)", () => {
    expect(postCaptureTransition("CANCELLED")).toEqual({
      activate: false,
      unblockStudents: false,
    })
  })
})
