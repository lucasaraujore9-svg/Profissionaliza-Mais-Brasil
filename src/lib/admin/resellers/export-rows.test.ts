import { describe, it, expect } from "vitest"
import type { TenantCharge } from "@/lib/tenant-billing/types"
import {
  buildCobrancasSheet,
  buildHistoricoSheet,
  buildUnidadesSheet,
  type ResellerExportUnit,
} from "./export-rows"

/*
 * A planilha de revendedores.
 *
 * O que quebra num export não é a consulta — é a coluna que entra no meio e
 * desloca todas as seguintes, fazendo o MRR de uma unidade aparecer na linha de
 * outra. Ninguém percebe: a planilha abre, os números têm cara de número.
 * Por isso o primeiro teste é o alinhamento coluna↔célula, e ele vale para as
 * três abas.
 *
 * O segundo assunto é FUSO. `dueDate` é uma data civil gravada como meia-noite
 * UTC; `createdAt` é um instante. Tratar os dois igual erra por um dia — em
 * direções opostas.
 */

function charge(over: Partial<TenantCharge> = {}): TenantCharge {
  return {
    id: "c1",
    asaasPaymentId: "pay_1",
    amount: 209,
    billingType: "BOLETO",
    status: "PENDING",
    dueDate: "2026-08-20T00:00:00.000Z",
    paidAt: null,
    invoiceUrl: "https://asaas.com/i/abc",
    bankSlipUrl: "https://asaas.com/b/abc.pdf",
    daysUntilDue: 6,
    urgency: "scheduled",
    markedPaid: false,
    ...over,
  }
}

function unit(over: Partial<ResellerExportUnit> = {}): ResellerExportUnit {
  return {
    id: "t1",
    name: "Unidade Um",
    slug: "unidade-um",
    status: "ACTIVE",
    createdAt: "2026-01-10T12:00:00.000Z",
    activatedAt: null,
    nuncaAtivou: false,
    customDomain: null,
    domainVerified: false,

    ownerName: "Fulano",
    ownerEmail: "fulano@ex.com",
    ownerPhone: "31999990000",
    ownerCpf: "12345678901",
    ownerStatus: "ATIVO",
    ownerLastActiveAt: null,

    accountManagerName: "Gerente",
    salesUserName: null,
    referrerName: null,
    referralCode: "REF1",
    referralsCount: 0,
    referralsActiveCount: 0,

    planValue: 209,
    promoValue: null,
    promoMonths: null,
    firstPaymentMaxInstallments: 1,
    interestFreeInstallments: 1,
    billingMode: "AUTO",
    asaasCustomerId: "cus_1",
    asaasSubscriptionId: "sub_1",

    nextCharge: null,
    openCharges: [],
    openCount: 0,
    openAmount: 0,
    overdueCount: 0,
    overdueAmount: 0,
    paidCount: 0,
    paidTotal: 0,
    lastPaidAt: null,

    students: 0,
    studentsByStatus: {},
    courses: 0,
    enrollments: 0,
    enrollmentsActive: 0,

    salesCount: 0,
    salesRevenue: 0,
    lastSaleAt: null,

    mpConnected: false,
    asaasConnected: false,
    salesGateway: "MP",
    plataformaVendedorId: null,
    poloName: null,

    automationEnabled: false,
    ejaEnabled: false,
    tecnicaEnabled: false,
    canSellResellers: false,
    monthlyAllowed: false,
    monthlyEnabled: false,
    monthlyScope: "DIRECT_ONLY",
    paceGateEnabled: null,

    waStatus: "DISCONNECTED",
    waConnectedPhone: null,
    whatsapp: null,
    supportEmail: null,
    ...over,
  }
}

/** Valor da célula sob um cabeçalho — por NOME, não por índice. */
function cell(
  sheet: { columns: { header: string }[]; rows: unknown[][] },
  rowIndex: number,
  header: string,
): unknown {
  const i = sheet.columns.findIndex((c) => c.header === header)
  expect(i, `coluna "${header}" não existe`).toBeGreaterThanOrEqual(0)
  return sheet.rows[rowIndex][i]
}

describe("planilha de revendedores", () => {
  it("toda linha tem exatamente uma célula por coluna, nas três abas", () => {
    const units = [
      unit({ nextCharge: charge(), openCharges: [charge()] }),
      unit({ id: "t2", slug: "dois", name: "Dois" }),
    ]
    const sheets = [
      buildUnidadesSheet(units),
      buildCobrancasSheet(units),
      buildHistoricoSheet(
        [{ tenantId: "t1", charge: charge(), notes: null }],
        new Map([["t1", { name: "Unidade Um", slug: "unidade-um" }]]),
      ),
    ]
    for (const sheet of sheets) {
      expect(sheet.rows.length, `${sheet.name} sem linhas`).toBeGreaterThan(0)
      for (const row of sheet.rows) {
        expect(row.length, `${sheet.name}: linha desalinhada`).toBe(
          sheet.columns.length,
        )
      }
    }
  })

  it("vencimento sai no dia civil do boleto, sem recuar pelo fuso", () => {
    // Meia-noite UTC do dia 20 é 21h do dia 19 no Brasil. Converter o fuso aqui
    // (o erro natural) antecipa TODO vencimento em um dia.
    const sheet = buildUnidadesSheet([
      unit({ nextCharge: charge({ dueDate: "2026-08-20T00:00:00.000Z" }) }),
    ])
    expect(cell(sheet, 0, "Próximo vencimento")).toBe("2026-08-20")
  })

  it("instante sai no dia civil brasileiro, não no dia UTC", () => {
    // 01h30 UTC do dia 14 = 22h30 do dia 13 no Brasil. Sem a conversão, uma
    // venda da noite de quinta é contada na sexta.
    const sheet = buildUnidadesSheet([
      unit({
        createdAt: "2026-08-14T01:30:00.000Z",
        lastSaleAt: "2026-08-14T01:30:00.000Z",
      }),
    ])
    expect(cell(sheet, 0, "Criada em")).toBe("2026-08-13")
    expect(cell(sheet, 0, "Última venda")).toBe("2026-08-13")
  })

  it("unidade sem venda fica com ticket médio vazio, não R$ 0,00", () => {
    const semVenda = buildUnidadesSheet([unit({ salesCount: 0, salesRevenue: 0 })])
    expect(cell(semVenda, 0, "Ticket médio (R$)")).toBeNull()

    const comVenda = buildUnidadesSheet([
      unit({ salesCount: 4, salesRevenue: 1000 }),
    ])
    expect(cell(comVenda, 0, "Ticket médio (R$)")).toBe(250)
  })

  it("sem cobrança em aberto, a coluna de situação diz isso em vez de ficar vazia", () => {
    const sheet = buildUnidadesSheet([unit({ nextCharge: null })])
    expect(cell(sheet, 0, "Próximo vencimento")).toBeNull()
    expect(cell(sheet, 0, "Situação da cobrança")).toBe("Sem cobrança em aberto")
    expect(cell(sheet, 0, "Link de pagamento")).toBeNull()
  })

  it("a situação vem da data, não do status do Asaas", () => {
    // Boleto vencido cujo PAYMENT_OVERDUE ainda não chegou: status é PENDING.
    const sheet = buildUnidadesSheet([
      unit({
        nextCharge: charge({
          status: "PENDING",
          daysUntilDue: -12,
          urgency: "overdue",
        }),
      }),
    ])
    expect(cell(sheet, 0, "Situação da cobrança")).toBe("Vencida há 12 dias")
  })

  it("aba de cobranças ordena da mais atrasada para a mais distante, cruzando unidades", () => {
    const sheet = buildCobrancasSheet([
      unit({
        id: "a",
        name: "A",
        openCharges: [charge({ daysUntilDue: 5, urgency: "due-soon" })],
      }),
      unit({
        id: "b",
        name: "B",
        openCharges: [
          charge({ daysUntilDue: -30, urgency: "overdue" }),
          charge({ daysUntilDue: 0, urgency: "due-today" }),
        ],
      }),
    ])
    expect(sheet.rows.map((r) => cell(sheet, sheet.rows.indexOf(r), "Unidade"))).toEqual(
      ["B", "B", "A"],
    )
    expect(cell(sheet, 0, "Dias até vencer")).toBe(-30)
    expect(cell(sheet, 2, "Dias até vencer")).toBe(5)
  })

  it("leva os dois links de pagamento da cobrança em aberto", () => {
    const sheet = buildCobrancasSheet([
      unit({ openCharges: [charge({ asaasPaymentId: "pay_9" })] }),
    ])
    expect(cell(sheet, 0, "Link do boleto")).toBe("https://asaas.com/b/abc.pdf")
    expect(cell(sheet, 0, "Fatura no Asaas")).toBe("https://asaas.com/i/abc")
    // A nossa página de cobrança é absoluta — link relativo não clica no Excel.
    expect(String(cell(sheet, 0, "Link de pagamento"))).toMatch(
      /^https?:\/\/.+\/cobranca\/pay_9$/,
    )
  })

  it("histórico marca a baixa manual do financeiro", () => {
    const sheet = buildHistoricoSheet(
      [
        {
          tenantId: "t1",
          charge: charge({ markedPaid: true, paidAt: "2026-07-02T13:00:00.000Z" }),
          notes: "PIX recebido por fora",
        },
      ],
      new Map([["t1", { name: "Unidade Um", slug: "unidade-um" }]]),
    )
    expect(cell(sheet, 0, "Baixa manual")).toBe("Sim")
    expect(cell(sheet, 0, "Pago em")).toBe("2026-07-02")
    expect(cell(sheet, 0, "Observações")).toBe("PIX recebido por fora")
    expect(cell(sheet, 0, "Unidade")).toBe("Unidade Um")
  })

  it("status cru do banco nunca chega à planilha", () => {
    const sheet = buildUnidadesSheet([unit({ status: "SUSPENDED" })])
    expect(cell(sheet, 0, "Status")).toBe("Suspenso")
  })

  it("o aviso de truncamento acompanha a aba", () => {
    const sheet = buildUnidadesSheet([unit()], "cortado em 10000")
    expect(sheet.note).toBe("cortado em 10000")
  })
})
