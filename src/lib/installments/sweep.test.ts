import { describe, it, expect, vi, beforeEach } from "vitest"

// Varredura diária do carnê. O trecho coberto aqui é a etapa C — a rede de
// segurança da cota de aulas. O que precisa ser provado é QUEM ela recolhe:
// errar o filtro não quebra nada visivelmente, só deixa matrícula parcelada
// fora da trava para sempre.

vi.mock("@/lib/prisma", () => ({
  prisma: {
    boletoInstallment: { findMany: vi.fn(), update: vi.fn() },
    enrollment: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock("@/lib/students/plataforma-actions", () => ({ blockStudentInEA: vi.fn() }))
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }))
vi.mock("@/lib/enrollment/pace", () => ({ evaluatePaceGate: vi.fn() }))
vi.mock("./plan", () => ({ generateMpBoletoForInstallment: vi.fn() }))
vi.mock("./flex-charge", () => ({ chargeFlexRow: vi.fn() }))
vi.mock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }))
vi.mock("@/lib/email/tenant-brand", () => ({ loadTenantEmailBrand: vi.fn(async () => ({ name: "Loja" })) }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { prisma } from "@/lib/prisma"
import { evaluatePaceGate } from "@/lib/enrollment/pace"
import { PACE_GATED_WHERE, PACE_GATED_CONTENT_WHERE } from "@/lib/enrollment/pace-gate"
import { runBoletoInstallmentSweep } from "./sweep"
import { generateMpBoletoForInstallment } from "./plan"
import { chargeFlexRow } from "./flex-charge"
import { sendEmail } from "@/lib/email/mailer"

const p = prisma as unknown as {
  boletoInstallment: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  enrollment: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}
const paceMock = evaluatePaceGate as unknown as ReturnType<typeof vi.fn>

/** Argumento do `findMany` de matrículas — a consulta da etapa C. */
function paceQuery() {
  expect(p.enrollment.findMany).toHaveBeenCalledTimes(1)
  return p.enrollment.findMany.mock.calls[0][0]
}

beforeEach(() => {
  vi.clearAllMocks()
  // Sem parcela a emitir nem a vencer: isola a etapa C.
  p.boletoInstallment.findMany.mockResolvedValue([])
  p.enrollment.findMany.mockResolvedValue([])
  paceMock.mockResolvedValue(null)
})

describe("runBoletoInstallmentSweep — reconciliação da cota de aulas", () => {
  it("só olha matrícula ATIVA sob a regra da cota (plano próprio ou herdado)", async () => {
    await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    const query = paceQuery()
    expect(query.where.status).toBe("ACTIVE")
    // O gêmeo SQL de `isPaceGatedPlan` precisa entrar por `AND`: dois `OR`
    // soltos no mesmo objeto seriam a MESMA chave e o segundo apagaria o
    // primeiro — a varredura passaria a recolher matrícula à vista.
    expect(query.where.AND[0]).toEqual(PACE_GATED_WHERE)
  })

  it("não carrega e-book: a cota conta AULAS, e um arquivo não tem nenhuma", async () => {
    await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    // `evaluatePaceGate` dispensa o e-book de qualquer forma, então esquecer
    // este filtro não travaria ninguém por engano — só faria a varredura
    // carregar todo e-book parcelado da base toda noite para não fazer nada.
    expect(paceQuery().where.AND[1]).toEqual(PACE_GATED_CONTENT_WHERE)
  })

  it("recolhe as travadas, as que já andaram e as que ainda não têm teto", async () => {
    await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    expect(paceQuery().where.AND[2].OR).toEqual([
      { paceBlockedAt: { not: null } },
      { paceExemptAt: null, progressPercent: { gt: 0 } },
      // Sem esta, a venda parcelada que ainda não andou (e a que teve o envio
      // ao LMS falho) ficava com o curso inteiro liberado até o aluno passar
      // da cota — tarde demais.
      { paceExemptAt: null, paceAppliedPercent: null },
    ])
  })

  it("conta como reconciliada só a matrícula que mudou de estado", async () => {
    p.enrollment.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }])
    paceMock
      .mockResolvedValueOnce({ changed: true })
      .mockResolvedValueOnce({ changed: false })

    const out = await runBoletoInstallmentSweep(new Date("2026-08-07T09:00:00.000Z"))

    expect(paceMock).toHaveBeenCalledTimes(2)
    expect(out.paceReconciled).toBe(1)
  })
})

// ── Parcelado flex (venda direta com meio escolhido) ─────────────────────────

const NOW = new Date("2026-11-10T12:00:00.000Z")
const DAY = 86_400_000
const chargeMock = chargeFlexRow as unknown as ReturnType<typeof vi.fn>
const sendMock = sendEmail as unknown as ReturnType<typeof vi.fn>
const legacyMock = generateMpBoletoForInstallment as unknown as ReturnType<typeof vi.fn>

const student = {
  id: "s1",
  nome: "Ana Souza",
  email: "ana@x.com",
  cpf: "12345678909",
  fone: null,
  responsavel: null,
  cpfResponsavel: null,
  responsavelEmail: null,
  responsavelFone: null,
  asaasCustomerId: null,
  responsavelAsaasCustomerId: null,
  cep: "01001000",
  rua: "Rua A",
  numero: "1",
  bairro: "Centro",
  cidade: "SP",
  estado: "SP",
}

/** Cada passo da varredura tem a sua consulta: roteia o mock pelo `where`. */
function rowsFor(q: {
  legacy?: unknown[]
  emit?: unknown[]
  email?: unknown[]
  overdue?: unknown[]
}) {
  p.boletoInstallment.findMany.mockImplementation(async ({ where }: { where: { availableEmailSentAt?: null; gateway?: string; enrollment?: { installmentMethod?: string } } }) => {
    if (where.availableEmailSentAt === null) return q.email ?? []
    if (where.enrollment?.installmentMethod === "BOLETO") return q.emit ?? []
    if (where.gateway === "MP") return q.legacy ?? []
    return q.overdue ?? []
  })
}

function emailRow(i: number) {
  return {
    id: `r${i}`,
    enrollmentId: `enr${i}`,
    amount: 150,
    dueDate: new Date("2026-11-15T00:00:00.000Z"),
    enrollment: {
      tenantId: "t1",
      student: { nome: "Ana Souza", email: "ana@x.com" },
      course: { nome: "Curso X" },
      tenant: { slug: "loja", customDomain: null, domainVerified: false },
    },
  }
}

function cardRow(daysLate: number, extra: Record<string, unknown> = {}) {
  return {
    id: "c1",
    enrollmentId: "enrC",
    status: "SCHEDULED",
    dueDate: new Date(NOW.getTime() - daysLate * DAY),
    cardDeclinedAt: null,
    enrollment: {
      flexInstallments: true,
      installmentMethod: "CREDIT_CARD",
      asaasSubscriptionId: "sub_1",
      mpSubscriptionId: null,
    },
    ...extra,
  }
}

describe("runBoletoInstallmentSweep — parcelado flex", () => {
  beforeEach(() => {
    chargeMock.mockResolvedValue({ kind: "pending", boleto: { url: "https://b" } })
    sendMock.mockResolvedValue({ id: "m1" })
    p.boletoInstallment.update.mockResolvedValue({})
    p.enrollment.findUnique.mockResolvedValue(null)
  })

  it("plano no boleto: linha na janela vira boleto pelo chargeFlexRow, com o pagador do banco", async () => {
    rowsFor({ emit: [{ id: "b1", gateway: "ASAAS", enrollment: { student } }] })

    const out = await runBoletoInstallmentSweep(NOW)

    expect(chargeMock).toHaveBeenCalledWith({
      rowId: "b1",
      method: "BOLETO",
      payer: {
        nome: "Ana Souza",
        email: "ana@x.com",
        cpf: "12345678909",
        phone: null,
        address: { cep: "01001000", rua: "Rua A", numero: "1", bairro: "Centro", cidade: "SP", estado: "SP" },
      },
    })
    expect(out.flexGenerated).toBe(1)
    // O carnê legado (passo A) não pega a linha flex: sem lock, correria com o chargeFlexRow.
    const legacyQuery = p.boletoInstallment.findMany.mock.calls
      .map((c) => c[0].where)
      .find((w) => w.gateway === "MP")
    expect(legacyQuery.enrollment.flexInstallments).toBe(false)
  })

  it("boleto MP sem endereço salvo: não emite, conta e segue; erro de emissão não derruba a varredura", async () => {
    rowsFor({
      emit: [
        { id: "b1", gateway: "MP", enrollment: { student: { ...student, cep: null } } },
        { id: "b2", gateway: "ASAAS", enrollment: { student } },
        { id: "b3", gateway: "ASAAS", enrollment: { student } },
      ],
    })
    chargeMock
      .mockResolvedValueOnce({ kind: "error", httpStatus: 400, code: "ADDRESS_REQUIRED", error: "x" })
      .mockResolvedValueOnce({ kind: "error", httpStatus: 409, code: "PAYMENT_IN_PROGRESS", error: "x" })
      .mockRejectedValueOnce(new Error("gateway fora"))

    const out = await runBoletoInstallmentSweep(NOW)

    expect(out.flexGenerated).toBe(0)
    expect(out.flexSkippedNoAddress).toBe(1)
    expect(out.generateErrors).toBe(2)
  })

  it("20 linhas elegíveis → 15 e-mails em sequência e 15 marcas; o resto fica para a próxima", async () => {
    rowsFor({ email: Array.from({ length: 20 }, (_, i) => emailRow(i)) })

    const out = await runBoletoInstallmentSweep(NOW)

    expect(sendMock).toHaveBeenCalledTimes(15)
    const marks = p.boletoInstallment.update.mock.calls.filter((c) => c[0].data.availableEmailSentAt)
    expect(marks).toHaveLength(15)
    expect(out.flexEmailed).toBe(15)
    const first = sendMock.mock.calls[0][0]
    expect(first.to).toBe("ana@x.com")
    expect(first.template.type).toBe("installment-available")
    expect(first.template.props).toMatchObject({
      amount: "R$ 150,00",
      dueDate: "15/11/2026",
      paymentUrl: expect.stringMatching(/^https:\/\/loja\..+\/pagar\/enr0$/),
    })
  })

  it("e-mail que falha não grava a marca (re-tenta na próxima rodada)", async () => {
    rowsFor({ email: [emailRow(1), emailRow(2)] })
    sendMock.mockRejectedValueOnce(new Error("smtp")).mockResolvedValueOnce({ id: "m" })

    const out = await runBoletoInstallmentSweep(NOW)

    const marks = p.boletoInstallment.update.mock.calls.filter((c) => c[0].data.availableEmailSentAt)
    expect(marks.map((c) => c[0].where.id)).toEqual(["r2"])
    expect(out.flexEmailed).toBe(1)
  })

  it("a consulta do e-mail: só PIX/boleto/sem meio, sem a entrada, na janela, ainda não avisada", async () => {
    rowsFor({})
    await runBoletoInstallmentSweep(NOW)
    const where = p.boletoInstallment.findMany.mock.calls
      .map((c) => c[0].where)
      .find((w) => w.availableEmailSentAt === null)
    expect(where.enrollment.flexInstallments).toBe(true)
    expect(where.enrollment.OR).toEqual([{ installmentMethod: { in: ["PIX", "BOLETO"] } }, { installmentMethod: null }])
    expect(where.OR).toEqual([{ number: { gt: 1 } }, { enrollment: { flexHasDownPayment: false } }])
    expect(where.dueDate.lte).toEqual(new Date(NOW.getTime() + 7 * DAY))
  })

  it("cartão com assinatura viva vencido há 1 dia: ainda não é OVERDUE", async () => {
    rowsFor({ overdue: [cardRow(1)] })
    const out = await runBoletoInstallmentSweep(NOW)
    expect(out.markedOverdue).toBe(0)
  })

  it("cartão com assinatura viva vencido há 4 dias: vira OVERDUE", async () => {
    rowsFor({ overdue: [cardRow(4)] })
    const out = await runBoletoInstallmentSweep(NOW)
    expect(out.markedOverdue).toBe(1)
    expect(p.boletoInstallment.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "OVERDUE" } })
  })

  it("cartão recusado não tem carência: vencido há 1 dia já é OVERDUE", async () => {
    rowsFor({ overdue: [cardRow(1, { cardDeclinedAt: new Date(NOW.getTime() - DAY) })] })
    const out = await runBoletoInstallmentSweep(NOW)
    expect(out.markedOverdue).toBe(1)
  })

  it("carnê legado (sem flex) segue o caminho atual: boleto MP e OVERDUE no dia seguinte", async () => {
    rowsFor({
      legacy: [{ id: "L1" }],
      overdue: [
        {
          id: "L2",
          enrollmentId: "enrL",
          status: "GENERATED",
          dueDate: new Date(NOW.getTime() - DAY),
          cardDeclinedAt: null,
          enrollment: { flexInstallments: false, installmentMethod: null, asaasSubscriptionId: null, mpSubscriptionId: null },
        },
      ],
    })
    const out = await runBoletoInstallmentSweep(NOW)
    expect(legacyMock).toHaveBeenCalledWith("L1")
    expect(chargeMock).not.toHaveBeenCalled()
    expect(out.generated).toBe(1)
    expect(out.markedOverdue).toBe(1)
  })
})
