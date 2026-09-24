import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subscriptionPayment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    studentSubscription: { findUnique: vi.fn(), update: vi.fn() },
    student: { findUnique: vi.fn(async () => ({ nome: "Ana Souza" })) },
  },
}))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => null) }))
vi.mock("@/lib/errors", () => ({ swallow: () => () => undefined }))
vi.mock("./cancel", () => ({ cancelSubscriptionAccess: vi.fn(async () => ({})) }))
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { contextLogger: () => noop, logger: noop }
})

import { prisma } from "@/lib/prisma"
import { createNotification } from "@/lib/notifications"
import { cancelSubscriptionAccess } from "./cancel"
import {
  settleSubscriptionCycle,
  markSubscriptionPastDue,
  recordOpenSubscriptionCharge,
  revokeSubscriptionForRefund,
} from "./renew"

const findPay = prisma.subscriptionPayment.findFirst as unknown as ReturnType<typeof vi.fn>
const createPay = prisma.subscriptionPayment.create as unknown as ReturnType<typeof vi.fn>
const updatePays = prisma.subscriptionPayment.updateMany as unknown as ReturnType<typeof vi.fn>
const updatePay = prisma.subscriptionPayment.update as unknown as ReturnType<typeof vi.fn>
const findPays = prisma.subscriptionPayment.findMany as unknown as ReturnType<typeof vi.fn>
const findSub = prisma.studentSubscription.findUnique as unknown as ReturnType<typeof vi.fn>
const updateSub = prisma.studentSubscription.update as unknown as ReturnType<typeof vi.fn>
const notify = createNotification as unknown as ReturnType<typeof vi.fn>

const PAID = new Date("2026-08-20T12:00:00Z")

function event(over: Record<string, unknown> = {}) {
  return {
    gateway: "ASAAS" as const,
    externalPaymentId: "pay_1",
    amount: 49.9,
    paidAt: PAID,
    dueDate: PAID,
    ...over,
  }
}

function sub(over: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    tenantId: null,
    status: "ACTIVE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    studentId: "st_1",
    // Periodicidade CONGELADA na contratacao — e ela que diz quanto o pagamento
    // compra. Ler do plano faria um assinante mensal virar anual no dia em que
    // alguem editasse o catalogo.
    interval: "MONTHLY",
    startedAt: null,
    plan: { name: "Plano Total" },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  findPay.mockResolvedValue(null)
  findSub.mockResolvedValue(sub())
})

describe("settleSubscriptionCycle", () => {
  it("registra o ciclo e empurra o periodo um mes", async () => {
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(true)
    const data = updateSub.mock.calls[0][0].data
    expect(data.status).toBe("ACTIVE")
    expect(data.currentPeriodEnd.toISOString()).toBe("2026-09-20T12:00:00.000Z")
  })

  it("re-entrega do webhook NAO concede mes extra", async () => {
    // Um `currentPeriodEnd += 1 mês` cego daria acesso de graça a cada
    // reentrega do gateway.
    findPay.mockResolvedValue({ id: "sp_1", paidAt: PAID })
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(false)
    expect(createPay).not.toHaveBeenCalled()
    expect(updatePays).not.toHaveBeenCalled()
    expect(updateSub).not.toHaveBeenCalled()
  })

  it("ciclo registrado EM ABERTO (PAYMENT_CREATED) é liquidado quando pago", async () => {
    // O PIX/boleto chega primeiro como cobrança aberta. Tratar a linha como
    // "já registrado" deixava o aluno pagante sem acesso até ser cancelado.
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null })
    updatePays.mockResolvedValue({ count: 1 })

    const r = await settleSubscriptionCycle("sub_1", event())

    expect(r.settled).toBe(true)
    expect(updatePays).toHaveBeenCalledWith({
      where: { id: "sp_1", paidAt: null },
      data: expect.objectContaining({ status: "CONFIRMED", paidAt: PAID }),
    })
    expect(createPay).not.toHaveBeenCalled()
    expect(updateSub.mock.calls[0][0].data.status).toBe("ACTIVE")
  })

  it("dois eventos de pagamento simultâneos não empurram o período duas vezes", async () => {
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null })
    updatePays.mockResolvedValue({ count: 0 })

    const r = await settleSubscriptionCycle("sub_1", event())

    expect(r.settled).toBe(false)
    expect(updateSub).not.toHaveBeenCalled()
  })

  it("renovacao antecipada soma sobre o ciclo vigente, sem encurtar", async () => {
    // Pagou dia 20 um ciclo que só vence dia 30: o novo fim é 30+1mês, não
    // 20+1mês — senão o aluno perde os 10 dias que já tinha pago.
    findSub.mockResolvedValue(
      sub({ currentPeriodEnd: new Date("2026-08-30T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2026-09-30T12:00:00.000Z")
  })

  it("ciclo ja vencido nao gera credito retroativo", async () => {
    // Fim do ciclo em junho, pagamento em agosto: o novo ciclo conta de agosto,
    // não de junho — senão ele pagaria um mês e receberia zero dia de acesso.
    findSub.mockResolvedValue(
      sub({ currentPeriodEnd: new Date("2026-06-01T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2026-09-20T12:00:00.000Z")
  })

  it("pagar tira a assinatura de PAST_DUE", async () => {
    findSub.mockResolvedValue(
      sub({ status: "PAST_DUE", currentPeriodEnd: new Date("2026-08-10T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(updateSub.mock.calls[0][0].data.status).toBe("ACTIVE")
  })

  it("fim de mes nao estoura (31/01 -> 28/02)", async () => {
    findSub.mockResolvedValue(
      sub({ currentPeriodEnd: new Date("2027-01-31T12:00:00Z") }),
    )
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z")
  })

  it("assinatura CANCELADA nao ressuscita com pagamento tardio", async () => {
    // Enquanto a recorrência seguia viva no gateway, a cobrança do mês seguinte
    // reabria a linha como ACTIVE — o aluno via "assinatura ativa" com TODAS as
    // matrículas canceladas e o acesso já revogado na fornecedora.
    findSub.mockResolvedValue(sub({ status: "CANCELLED" }))
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(false)
    expect(updateSub).not.toHaveBeenCalled()
    // O dinheiro não some do histórico, e o admin é avisado da órfã.
    expect(createPay).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it("assinatura EXPIRED tambem nao ressuscita", async () => {
    findSub.mockResolvedValue(sub({ status: "EXPIRED" }))
    const r = await settleSubscriptionCycle("sub_1", event())
    expect(r.settled).toBe(false)
    expect(updateSub).not.toHaveBeenCalled()
  })

  it("idempotencia olha o gateway certo", async () => {
    await settleSubscriptionCycle("sub_1", event({ gateway: "MP", externalPaymentId: "mp_9" }))
    expect(findPay.mock.calls[0][0].where).toEqual({ mpPaymentId: "mp_9" })
  })
})

describe("1o pagamento avisa aluno e unidade", () => {
  // A assinatura nao cria matricula no pagamento: sem estes avisos o aluno caia
  // numa area sem curso e a unidade nao via venda — "o sistema nao deu baixa".
  it("ativacao notifica o aluno (escolher cursos) e a unidade (venda)", async () => {
    findSub.mockResolvedValue(sub({ tenantId: "t_1" }))
    await settleSubscriptionCycle("sub_1", event())

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "STUDENT", studentId: "st_1", href: "/aluno/assinatura" }),
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ audience: "TENANT", tenantId: "t_1", href: "/painel/vendas" }),
    )
  })

  it("renovacao (ja tinha startedAt) nao repete o aviso", async () => {
    findSub.mockResolvedValue(sub({ tenantId: "t_1", startedAt: new Date("2026-07-20T12:00:00Z") }))
    await settleSubscriptionCycle("sub_1", event())
    expect(notify).not.toHaveBeenCalled()
  })

  it("re-entrega do 1o pagamento nao avisa de novo", async () => {
    findPay.mockResolvedValue({ id: "sp_1", paidAt: PAID })
    await settleSubscriptionCycle("sub_1", event())
    expect(notify).not.toHaveBeenCalled()
  })
})

describe("revokeSubscriptionForRefund", () => {
  it("marca o ciclo PAGO como REFUNDED antes de revogar — tira da receita", async () => {
    await revokeSubscriptionForRefund("sub_1", { gateway: "ASAAS", externalPaymentId: "pay_9" })
    expect(updatePays).toHaveBeenCalledWith({
      where: { subscriptionId: "sub_1", paidAt: { not: null }, asaasPaymentId: "pay_9" },
      data: { status: "REFUNDED" },
    })
    expect(cancelSubscriptionAccess).toHaveBeenCalledWith("sub_1", "REFUNDED", true)
  })

  it("no MP casa pelo id do MP", async () => {
    await revokeSubscriptionForRefund("sub_1", { gateway: "MP", externalPaymentId: "123" })
    expect(updatePays.mock.calls[0][0].where).toMatchObject({ mpPaymentId: "123" })
  })
})

describe("markSubscriptionPastDue", () => {
  it("marca em atraso mas NAO corta o acesso", async () => {
    // Cortar aqui derrubaria quem paga a fatura com um dia de folga — PIX e
    // boleto não têm débito automático.
    await markSubscriptionPastDue("sub_1")
    expect(updateSub.mock.calls[0][0].data).toEqual({ status: "PAST_DUE" })
  })

  it("nao reabre assinatura ja encerrada", async () => {
    findSub.mockResolvedValue(sub({ status: "CANCELLED" }))
    await markSubscriptionPastDue("sub_1")
    expect(updateSub).not.toHaveBeenCalled()
  })

  it("assinatura que NUNCA foi paga continua PENDING", async () => {
    // "Regularize para não perder o acesso" a quem nunca teve acesso — e o
    // carnê abandonado, que a varredura procura como PENDING, sumiria dela.
    findSub.mockResolvedValue(sub({ status: "PENDING" }))
    await markSubscriptionPastDue("sub_1")
    expect(updateSub).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe("assinatura no boleto (carnê)", () => {
  const FIRST_DUE = new Date("2026-08-25T12:00:00Z")

  it("boleto pago marca a LINHA do carnê sem trocar o vencimento da agenda", async () => {
    findSub.mockResolvedValue(sub({ boletoCarne: true }))
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null, number: 1 })
    updatePays.mockResolvedValue({ count: 1 })
    findPays.mockResolvedValue([{ number: 1, dueDate: FIRST_DUE, paidAt: PAID }])

    await settleSubscriptionCycle("sub_1", event({ dueDate: new Date("2026-08-20T00:00:00Z") }))

    const data = updatePays.mock.calls[0][0].data
    expect(data).toEqual({ status: "CONFIRMED", paidAt: PAID, amount: 49.9 })
    expect(data.dueDate).toBeUndefined()
  })

  it("o período sai da AGENDA: pago adiantado, vale até o vencimento do 2º boleto", async () => {
    // Somar um mês a partir do pagamento (20/08) encerraria o acesso em 20/09,
    // cinco dias antes do 2º boleto vencer (25/09).
    findSub.mockResolvedValue(sub({ boletoCarne: true }))
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null, number: 1 })
    updatePays.mockResolvedValue({ count: 1 })
    findPays.mockResolvedValue([
      { number: 1, dueDate: FIRST_DUE, paidAt: PAID },
      { number: 2, dueDate: new Date("2026-09-25T12:00:00Z"), paidAt: null },
    ])

    await settleSubscriptionCycle("sub_1", event())

    expect(updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString()).toBe(
      "2026-09-25T12:00:00.000Z",
    )
  })

  it("cada boleto pago soma um ciclo da agenda", async () => {
    findSub.mockResolvedValue(
      sub({ boletoCarne: true, currentPeriodEnd: new Date("2026-09-25T12:00:00Z") }),
    )
    findPay.mockResolvedValue({ id: "sp_2", paidAt: null, number: 2 })
    updatePays.mockResolvedValue({ count: 1 })
    findPays.mockResolvedValue([
      { number: 1, dueDate: FIRST_DUE, paidAt: new Date("2026-08-20T12:00:00Z") },
      { number: 2, dueDate: new Date("2026-09-25T12:00:00Z"), paidAt: new Date("2026-09-24T12:00:00Z") },
    ])

    await settleSubscriptionCycle("sub_1", event({ externalPaymentId: "pay_2" }))

    expect(updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString()).toBe(
      "2026-10-25T12:00:00.000Z",
    )
  })

  it("o período nunca recua", async () => {
    const later = new Date("2026-12-25T12:00:00Z")
    findSub.mockResolvedValue(sub({ boletoCarne: true, currentPeriodEnd: later }))
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null, number: 1 })
    updatePays.mockResolvedValue({ count: 1 })
    findPays.mockResolvedValue([{ number: 1, dueDate: FIRST_DUE, paidAt: PAID }])

    await settleSubscriptionCycle("sub_1", event())

    expect(updateSub.mock.calls[0][0].data.currentPeriodEnd).toEqual(later)
  })

  it("recorrência do gateway (sem carnê) segue somando um ciclo a partir do pagamento", async () => {
    await settleSubscriptionCycle("sub_1", event())
    expect(findPays).not.toHaveBeenCalled()
  })
})

describe("recordOpenSubscriptionCharge no carnê", () => {
  const open = {
    gateway: "ASAAS" as const,
    externalPaymentId: "pay_1",
    amount: 49.9,
    dueDate: PAID,
    status: "PENDING",
  }

  it("NÃO cria linha: quem cria o boleto do carnê é a plataforma", async () => {
    // O PAYMENT_CREATED chega enquanto o id ainda está sendo gravado; criar aqui
    // duplicaria o boleto e o id único derrubaria a emissão.
    findSub.mockResolvedValue({ id: "sub_1", tenantId: null, boletoCarne: true })
    findPay.mockResolvedValue(null)
    await recordOpenSubscriptionCharge("sub_1", open)
    expect(createPay).not.toHaveBeenCalled()
    expect(updatePay).not.toHaveBeenCalled()
  })

  it("atraso marca a linha, sem mexer no vencimento nem no boleto", async () => {
    findSub.mockResolvedValue({ id: "sub_1", tenantId: null, boletoCarne: true })
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null, number: 3, status: "PENDING" })
    await recordOpenSubscriptionCharge("sub_1", { ...open, status: "OVERDUE" })
    expect(updatePay).toHaveBeenCalledWith({
      where: { id: "sp_1" },
      data: { status: "OVERDUE" },
    })
  })

  it("boleto cancelado não volta a ficar em aberto", async () => {
    findSub.mockResolvedValue({ id: "sub_1", tenantId: null, boletoCarne: true })
    findPay.mockResolvedValue({ id: "sp_1", paidAt: null, number: 3, status: "CANCELLED" })
    await recordOpenSubscriptionCharge("sub_1", { ...open, status: "OVERDUE" })
    expect(updatePay).not.toHaveBeenCalled()
  })

  it("fora do carnê continua criando a cobrança em aberto", async () => {
    findSub.mockResolvedValue({ id: "sub_1", tenantId: null, boletoCarne: false })
    findPay.mockResolvedValue(null)
    await recordOpenSubscriptionCharge("sub_1", open)
    expect(createPay).toHaveBeenCalledTimes(1)
  })
})

describe("periodicidade congelada", () => {
  it("plano anual empurra o ciclo 12 meses, nao 1", async () => {
    findSub.mockResolvedValue(sub({ interval: "ANNUAL" }))
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2027-08-20T12:00:00.000Z")
  })

  it("plano trimestral empurra 3 meses", async () => {
    findSub.mockResolvedValue(sub({ interval: "QUARTERLY" }))
    await settleSubscriptionCycle("sub_1", event())
    expect(
      updateSub.mock.calls[0][0].data.currentPeriodEnd.toISOString(),
    ).toBe("2026-11-20T12:00:00.000Z")
  })

  it("VITALICIA nao grava prazo nenhum", async () => {
    // `currentPeriodEnd` tem que continuar null: e o sinal que mantem a linha
    // fora da varredura de carencia. Gravar uma data distante seria uma mentira
    // que a varredura acabaria cobrando, cancelando quem pagou pelo permanente.
    findSub.mockResolvedValue(sub({ interval: "LIFETIME" }))
    await settleSubscriptionCycle("sub_1", event())
    const data = updateSub.mock.calls[0][0].data
    expect(data.status).toBe("ACTIVE")
    expect(data.currentPeriodEnd).toBeUndefined()
    expect(data.startedAt).toEqual(PAID)
  })

  it("VITALICIA nao vai para PAST_DUE", async () => {
    // Nao ha mensalidade a atrasar. PAST_DUE anunciaria "regularize para nao
    // perder o acesso" a quem comprou acesso permanente.
    findSub.mockResolvedValue(sub({ interval: "LIFETIME" }))
    await markSubscriptionPastDue("sub_1")
    expect(updateSub).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})
