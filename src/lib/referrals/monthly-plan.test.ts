/**
 * Motor mensal — cobertura do PLANO MULTI-FASE (`commissionPlan`).
 *
 * monthly.test.ts cobre o motor com regra de fase unica (faixas singulares). Aqui
 * exercitamos o trecho mais intrincado da unificacao: quando ha um plano de fases,
 * cada unidade INDICADA tem o seu proprio relogio (commissionPlanStartedAt ??
 * activatedAt ?? createdAt), entao duas indicadas do MESMO indicador podem estar em
 * fases diferentes na MESMA competencia.
 *
 * Contratos travados aqui:
 *  - selecao de fase POR UNIDADE e `phaseIndex` gravado em cada linha do snapshot;
 *  - campos representativos de topo: fase unica => valores fieis; fases mistas =>
 *    `rate = 0` como SENTINELA de "misto" (as telas dependem disso) com `amount`,
 *    `unitCount` e `baseSum` REAIS;
 *  - `payoutBase: "REFERRED_THIS_MONTH"` (so as indicadas dentro do mes);
 *  - `bracketBasis: "NEW_REFERRALS_MONTH"` vs `"ACTIVE_UNITS"` alimentando
 *    `resolveBracket` com a contagem certa;
 *  - plano com fase intermediaria "em diante" (`durationMonths: null`), que
 *    `parsePlan` trunca — o motor tem de usar o plano truncado.
 *
 * Pano de fundo (o bug que motivou a unificacao): a regra vinha do tenant INDICADO
 * em vez do INDICADOR, e todo mundo caia no padrao global de 10%. Hoje a regra vem
 * so do indicador (`resolveEffectiveCommission`), e o TEMPO vem so da indicada.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  Prisma,
  type CommissionBracketBasis,
  type CommissionMode,
  type CommissionPayoutBase,
  type CommissionRateType,
} from "@prisma/client"

// O motor mensal e 100% I/O de Prisma: mockamos o client inteiro e dirigimos o
// cenario pelos retornos (mesmo padrao de monthly.test.ts / payout.test.ts).
vi.mock("@/lib/prisma", () => ({
  prisma: {
    systemSettings: { findUnique: vi.fn() },
    tenant: { findMany: vi.fn(), count: vi.fn() },
    tenantPayment: { groupBy: vi.fn(), findMany: vi.fn() },
    referralMonthlyCommission: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

// Notificacao e efeito colateral; precisa devolver Promise porque o motor
// encadeia `.catch(swallow(...))` no retorno.
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(async () => undefined),
}))

// O resolvedor de regra loga em fallback; silenciamos o Pino no teste.
vi.mock("@/lib/logger", () => {
  const noop = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger: noop, contextLogger: () => noop }
})

import { prisma } from "@/lib/prisma"
import { computeMonthlyCommissions } from "./monthly"

type AnyMock = ReturnType<typeof vi.fn>

const db = prisma as unknown as {
  systemSettings: { findUnique: AnyMock }
  tenant: { findMany: AnyMock; count: AnyMock }
  tenantPayment: { groupBy: AnyMock; findMany: AnyMock }
  referralMonthlyCommission: {
    findUnique: AnyMock
    create: AnyMock
    update: AnyMock
    delete: AnyMock
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Competencia apurada em todos os cenarios: maio/2026 (range.start = 01/05/2026). */
const PERIOD = "2026-05"

/**
 * Ancoras usadas para posicionar cada indicada no seu proprio relogio.
 * `monthsInProgram(ancora, 2026-05-01)` conta meses de CALENDARIO.
 */
const ANCHOR = {
  /** Mesmo mes da competencia => 0 meses de programa. */
  mes0: new Date(Date.UTC(2026, 4, 5)),
  /** Mes anterior => 1 mes de programa. */
  mes1: new Date(Date.UTC(2026, 3, 10)),
  /** Tres meses antes => 3 meses de programa (ja fora de uma fase de 3 meses). */
  mes3: new Date(Date.UTC(2026, 1, 10)),
  /** Um ano antes => 12 meses de programa. */
  mes12: new Date(Date.UTC(2025, 4, 1)),
}

interface SettingsRow {
  referralEnabled: boolean
  referralPayoutDay: number | null
  commissionMode: CommissionMode
  commissionBracketBasis: CommissionBracketBasis
  commissionRateType: CommissionRateType
  commissionPayoutBase: CommissionPayoutBase
  commissionBrackets: unknown
  commissionPlan: unknown
  defaultReferralPercent: unknown
  defaultReferralMinReferrals: number | null
}

const BASE_SETTINGS: SettingsRow = {
  referralEnabled: true,
  referralPayoutDay: 20,
  commissionMode: "MONTHLY_TIERED",
  commissionBracketBasis: "ACTIVE_UNITS",
  commissionRateType: "PERCENT",
  commissionPayoutBase: "ALL_ACTIVE",
  commissionBrackets: [],
  commissionPlan: null,
  defaultReferralPercent: 10,
  defaultReferralMinReferrals: 0,
}

interface ReferrerRow {
  id: string
  name: string
  createdAt: Date
  commissionMode: CommissionMode | null
  commissionBracketBasis: CommissionBracketBasis | null
  commissionRateType: CommissionRateType | null
  commissionPayoutBase: CommissionPayoutBase | null
  commissionBrackets: unknown
  commissionPlan: unknown
  commissionPlanStartedAt: Date | null
  referralMinReferrals: number | null
}

function referrer(over: Partial<ReferrerRow> = {}): ReferrerRow {
  return {
    id: "ref1",
    name: "Indicador",
    createdAt: new Date(Date.UTC(2024, 0, 1)),
    commissionMode: null,
    commissionBracketBasis: null,
    commissionRateType: null,
    commissionPayoutBase: null,
    commissionBrackets: null,
    commissionPlan: null,
    commissionPlanStartedAt: null,
    referralMinReferrals: null,
    ...over,
  }
}

interface UnitRow {
  id: string
  name: string
  status: string
  planValue: Prisma.Decimal
  /** Plano de TABELA: denominador da comissao FIXED proporcional (239 x 209). */
  automationEnabled: boolean
  createdAt: Date
  activatedAt: Date | null
  commissionPlanStartedAt: Date | null
}

function unit(
  id: string,
  over: Partial<Omit<UnitRow, "id" | "planValue">> & { planValue?: number } = {},
): UnitRow {
  const { planValue, ...rest } = over
  return {
    id,
    name: `Unidade ${id}`,
    // A query de unidades filtra por ACTIVE OU "pagou na competencia"; o motor
    // le o status para nao encolher a faixa por suspensao posterior ao mes.
    status: "ACTIVE",
    planValue: new Prisma.Decimal(planValue ?? 239),
    automationEnabled: true,
    // Ancora bem anterior ao periodo apurado: por padrao a unidade entra e NAO
    // conta como "indicada neste mes".
    createdAt: new Date(Date.UTC(2025, 0, 10)),
    activatedAt: null,
    commissionPlanStartedAt: null,
    ...rest,
  }
}

/** Uma fase crua do JSON gravado em `commissionPlan` (antes do parsePlan). */
interface RawPhase {
  durationMonths: number | null
  rateType: CommissionRateType
  bracketBasis: CommissionBracketBasis
  payoutBase: CommissionPayoutBase
  brackets: Array<{ upTo: number | null; value: number }>
}

function phase(over: Partial<RawPhase> = {}): RawPhase {
  return {
    durationMonths: null,
    rateType: "PERCENT",
    bracketBasis: "ACTIVE_UNITS",
    payoutBase: "ALL_ACTIVE",
    brackets: [{ upTo: null, value: 10 }],
    ...over,
  }
}

/** Faixa unica "em diante" — o formato que a UI grava no editor Simples. */
function flat(value: number): Array<{ upTo: number | null; value: number }> {
  return [{ upTo: null, value }]
}

interface Scenario {
  settings?: Partial<SettingsRow>
  referrers?: ReferrerRow[]
  units?: UnitRow[]
  /** Mensalidades recebidas no mes, por unidade (o que o groupBy devolveria). */
  paid?: Record<string, number>
  activeTotal?: number
  newThisMonth?: number
  existing?: { id: string; status: string; payoutId: string | null } | null
}

function arrange(s: Scenario = {}): void {
  const referrers = s.referrers ?? [referrer()]
  const units = s.units ?? []
  db.systemSettings.findUnique.mockResolvedValue({
    ...BASE_SETTINGS,
    ...s.settings,
  })
  // Os dois findMany do motor se distinguem pelo `where`: indicadores tem
  // `referrals`, unidades indicadas tem `referrerTenantId`.
  db.tenant.findMany.mockImplementation(
    async (args: { where: Record<string, unknown> }) =>
      args.where.referrals ? referrers : units,
  )
  // Os dois count: o do mes filtra por activatedAt, o total nao.
  db.tenant.count.mockImplementation(
    async (args: { where: Record<string, unknown> }) =>
      // "Novas do mes" e contado por COALESCE(activatedAt, createdAt) na
      // competencia — no Prisma isso vira um `OR` de dois ramos. O total da
      // carteira nao tem filtro de data.
      args.where.OR ? (s.newThisMonth ?? 0) : (s.activeTotal ?? units.length),
  )
  db.referralMonthlyCommission.findUnique.mockResolvedValue(s.existing ?? null)
  const paid = s.paid ?? {}
  // Uma fatura por unidade, no meio da competencia — estes cenarios sao de
  // PLANO (fases no tempo), nao de granularidade de fatura.
  const meioDoMes = new Date(Date.UTC(2026, 4, 15))
  db.tenantPayment.findMany.mockImplementation(async () =>
    Object.entries(paid).map(([tenantId, amount]) => ({
      tenantId,
      amount: new Prisma.Decimal(amount),
      // `competenceAt` = a que mes a mensalidade pertence. Aqui e o meio da
      // competencia (pagou dentro do mes da fatura); os casos de antecipacao e
      // atraso vivem em asaas/competencia.test.ts, que testa a regra em si.
      competenceAt: meioDoMes,
    })),
  )
  db.tenantPayment.groupBy.mockImplementation(async () => [])
  db.referralMonthlyCommission.create.mockResolvedValue({ id: "rmc1" })
  db.referralMonthlyCommission.update.mockResolvedValue({ id: "rmc1" })
  db.referralMonthlyCommission.delete.mockResolvedValue({ id: "rmc1" })
}

interface SnapshotLine {
  tenantId: string
  name: string
  mensalidade: number
  amount: number
  rateType?: CommissionRateType
  rate?: number
  phaseIndex?: number
}

interface WrittenData {
  mode: CommissionMode
  bracketBasis: CommissionBracketBasis
  rateType: CommissionRateType
  payoutBase: CommissionPayoutBase
  bracketCount: number
  rate: Prisma.Decimal
  unitCount: number
  baseSum: Prisma.Decimal
  amount: Prisma.Decimal
  linesSnapshot: SnapshotLine[]
  availableAt: Date
}

/** Payload gravado no `create` (a comissao do mes recem-apurada). */
function created(): WrittenData {
  expect(db.referralMonthlyCommission.create).toHaveBeenCalledTimes(1)
  const call = db.referralMonthlyCommission.create.mock.calls[0] as [
    { data: WrittenData },
  ]
  return call[0].data
}

/** Linha do snapshot de uma unidade especifica (a quebra fiel do demonstrativo). */
function lineOf(data: WrittenData, tenantId: string): SnapshotLine {
  const line = data.linesSnapshot.find((l) => l.tenantId === tenantId)
  expect(line, `esperava linha da unidade ${tenantId}`).toBeDefined()
  return line as SnapshotLine
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. Fase POR UNIDADE: duas indicadas de idades diferentes na mesma competencia
// ---------------------------------------------------------------------------

/**
 * Plano de 2 fases: primeiros 3 meses de CADA indicada a 50%, depois 15%.
 * A fase 0 tem bracketBasis NEW_REFERRALS_MONTH e a fase 1 ACTIVE_UNITS — como as
 * faixas sao "em diante" (sem teto), a contagem nao muda o valor, mas deixa
 * visivel qual fase virou a representativa do topo.
 */
function planoDuasFases(): RawPhase[] {
  return [
    phase({
      durationMonths: 3,
      rateType: "PERCENT",
      bracketBasis: "NEW_REFERRALS_MONTH",
      brackets: flat(50),
    }),
    phase({
      durationMonths: null,
      rateType: "PERCENT",
      bracketBasis: "ACTIVE_UNITS",
      brackets: flat(15),
    }),
  ]
}

describe("computeMonthlyCommissions — plano multi-fase, relogio por unidade", () => {
  /** Veterana (12 meses, fase 1) + novata (1 mes, fase 0), ambas pagando R$ 239. */
  function arrangeDuasFases(): void {
    arrange({
      referrers: [referrer({ commissionPlan: planoDuasFases() })],
      units: [
        unit("vet", { activatedAt: ANCHOR.mes12 }),
        unit("nova", { activatedAt: ANCHOR.mes1 }),
      ],
      activeTotal: 2,
      newThisMonth: 0,
      paid: { vet: 239, nova: 239 },
    })
  }

  it("cada indicada e apurada na fase do SEU proprio relogio", async () => {
    arrangeDuasFases()

    const out = await computeMonthlyCommissions(PERIOD)
    expect(out).toMatchObject({ processed: 1, created: 1, skipped: 0 })

    const data = created()
    // Conferencia a mao: 239 x 15% = 35,85 (veterana, fase 1)
    //                  + 239 x 50% = 119,50 (novata, fase 0) = 155,35.
    expect(Number(data.amount)).toBe(155.35)
    expect(data.unitCount).toBe(2)
    expect(Number(data.baseSum)).toBe(478)
    expect(data.mode).toBe("MONTHLY_TIERED")

    // Uma linha por unidade, cada uma com a SUA fase e a SUA aliquota.
    expect(lineOf(data, "vet")).toMatchObject({
      mensalidade: 239,
      amount: 35.85,
      rateType: "PERCENT",
      rate: 15,
      phaseIndex: 1,
    })
    expect(lineOf(data, "nova")).toMatchObject({
      mensalidade: 239,
      amount: 119.5,
      rateType: "PERCENT",
      rate: 50,
      phaseIndex: 0,
    })
  })

  it("a virada de fase acontece no 4o mes da indicada (fase de 3 meses)", async () => {
    arrange({
      referrers: [referrer({ commissionPlan: planoDuasFases() })],
      units: [
        // 2 meses de programa: ainda dentro da fase 0 (meses 0,1,2).
        unit("dentro", { activatedAt: new Date(Date.UTC(2026, 2, 10)) }),
        // 3 meses de programa: primeiro mes da fase 1.
        unit("fora", { activatedAt: ANCHOR.mes3 }),
      ],
      activeTotal: 2,
      paid: { dentro: 100, fora: 100 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(lineOf(data, "dentro")).toMatchObject({ phaseIndex: 0, rate: 50 })
    expect(lineOf(data, "fora")).toMatchObject({ phaseIndex: 1, rate: 15 })
    // 100 x 50% + 100 x 15% = 65.
    expect(Number(data.amount)).toBe(65)
  })

  it("commissionPlanStartedAt da indicada vence activatedAt no relogio da fase", async () => {
    arrange({
      referrers: [referrer({ commissionPlan: planoDuasFases() })],
      units: [
        // Ativada ha 12 meses (cairia na fase 1), mas o plano dela so comecou no
        // mes passado => fase 0.
        unit("remarcada", {
          activatedAt: ANCHOR.mes12,
          commissionPlanStartedAt: ANCHOR.mes1,
        }),
      ],
      activeTotal: 1,
      paid: { remarcada: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(lineOf(data, "remarcada")).toMatchObject({ phaseIndex: 0, rate: 50 })
    expect(Number(data.amount)).toBe(119.5)
  })
})

// ---------------------------------------------------------------------------
// 2. Campos representativos de topo — fase unica contribuindo
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — topo com UMA fase contribuindo", () => {
  it("grava os campos FIEIS da fase que efetivamente pagou", async () => {
    arrange({
      referrers: [
        referrer({
          commissionPlan: [
            // Fase 0 so paga quem foi indicada NO MES — a novata de abril nao
            // entra, entao a fase 0 nao contribui nesta competencia.
            phase({
              durationMonths: 3,
              rateType: "FIXED",
              bracketBasis: "NEW_REFERRALS_MONTH",
              payoutBase: "REFERRED_THIS_MONTH",
              brackets: flat(80),
            }),
            phase({
              durationMonths: null,
              rateType: "PERCENT",
              bracketBasis: "ACTIVE_UNITS",
              payoutBase: "ALL_ACTIVE",
              brackets: flat(15),
            }),
          ],
        }),
      ],
      units: [
        unit("nova", { activatedAt: ANCHOR.mes1 }), // fase 0, mas nao indicada no mes
        unit("vet", { activatedAt: ANCHOR.mes12 }), // fase 1
      ],
      activeTotal: 4,
      newThisMonth: 0,
      paid: { nova: 239, vet: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    // So a veterana pagou: 239 x 15% = 35,85.
    expect(Number(data.amount)).toBe(35.85)
    expect(data.unitCount).toBe(1)
    expect(Number(data.baseSum)).toBe(239)
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["vet"])
    expect(lineOf(data, "vet")).toMatchObject({ phaseIndex: 1, rate: 15 })

    // Topo fiel a fase 1 (a unica que contribuiu), NAO a fase 0 do plano.
    expect(Number(data.rate)).toBe(15)
    expect(data.rateType).toBe("PERCENT")
    expect(data.bracketBasis).toBe("ACTIVE_UNITS")
    expect(data.payoutBase).toBe("ALL_ACTIVE")
    expect(data.bracketCount).toBe(4) // contagem de ativas, base da fase 1
  })
})

// ---------------------------------------------------------------------------
// 3. Campos representativos de topo — DUAS fases contribuindo (sentinela)
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — topo com fases MISTAS", () => {
  it("grava rate = 0 como sentinela de misto, mas amount/unitCount/baseSum reais", async () => {
    arrange({
      referrers: [referrer({ commissionPlan: planoDuasFases() })],
      units: [
        unit("vet", { activatedAt: ANCHOR.mes12 }), // fase 1 (15%)
        unit("nova", { activatedAt: ANCHOR.mes1 }), // fase 0 (50%)
      ],
      activeTotal: 2,
      newThisMonth: 0,
      paid: { vet: 239, nova: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    // CONTRATO: nenhuma aliquota unica descreve o mes, entao o topo zera `rate`.
    // As telas leem esse 0 como "misto" e caem na quebra de linesSnapshot.
    expect(Number(data.rate)).toBe(0)
    // ...mas os numeros que o indicador recebe continuam REAIS.
    expect(Number(data.amount)).toBe(155.35)
    expect(data.unitCount).toBe(2)
    expect(Number(data.baseSum)).toBe(478)
    // Sem fase unica, os enums de topo caem na PRIMEIRA fase do plano.
    expect(data.bracketBasis).toBe("NEW_REFERRALS_MONTH")
    expect(data.bracketCount).toBe(0) // novas indicadas no mes
    // A quebra fiel (unica fonte confiavel no misto) preserva as duas aliquotas.
    expect(data.linesSnapshot.map((l) => l.rate)).toEqual([15, 50])
    expect(data.linesSnapshot.map((l) => l.phaseIndex)).toEqual([1, 0])
  })

  it("misto de FIXED com PERCENT: baseSum so acumula a fracao PERCENT", async () => {
    arrange({
      referrers: [
        referrer({
          commissionPlan: [
            phase({
              durationMonths: 3,
              rateType: "FIXED",
              bracketBasis: "ACTIVE_UNITS",
              brackets: flat(80),
            }),
            phase({
              durationMonths: null,
              rateType: "PERCENT",
              bracketBasis: "ACTIVE_UNITS",
              brackets: flat(15),
            }),
          ],
        }),
      ],
      units: [
        unit("nova", { activatedAt: ANCHOR.mes0 }), // fase 0, FIXED R$ 80
        unit("vet", { activatedAt: ANCHOR.mes12 }), // fase 1, 15% de 239
      ],
      activeTotal: 2,
      // As DUAS pagam: desde 09/09/2026 o FIXED tambem exige caixa no mes, e o
      // que este caso testa e o MISTO de tipos de fase, nao a proporcao.
      paid: { nova: 239, vet: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    // 80 (FIXED) + 35,85 (15% de 239) = 115,85.
    expect(Number(data.amount)).toBe(115.85)
    expect(data.unitCount).toBe(2)
    // baseSum e a soma das mensalidades que serviram de base ao PERCENT.
    expect(Number(data.baseSum)).toBe(239)
    expect(Number(data.rate)).toBe(0) // misto
    // rateType de topo cai no da PRIMEIRA linha (a FIXED) — no misto quem manda
    // e a linha, e por isso que o clawback consulta linesSnapshot.
    expect(data.rateType).toBe("FIXED")
    expect(lineOf(data, "nova")).toMatchObject({
      rateType: "FIXED",
      rate: 80,
      amount: 80,
      mensalidade: 239, // planValue, ja que nao houve mensalidade recebida
      phaseIndex: 0,
    })
    expect(lineOf(data, "vet")).toMatchObject({
      rateType: "PERCENT",
      rate: 15,
      amount: 35.85,
      phaseIndex: 1,
    })
  })
})

// ---------------------------------------------------------------------------
// 4. payoutBase: REFERRED_THIS_MONTH
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — payoutBase REFERRED_THIS_MONTH", () => {
  /** Mesma carteira nos dois testes; muda so o payoutBase da fase. */
  function arrangeCarteira(payoutBase: CommissionPayoutBase): void {
    arrange({
      referrers: [
        referrer({
          commissionPlan: [
            phase({
              durationMonths: null,
              rateType: "PERCENT",
              bracketBasis: "ACTIVE_UNITS",
              payoutBase,
              brackets: flat(50),
            }),
          ],
        }),
      ],
      units: [
        // Criada DENTRO da competencia apurada (indicada no mes).
        unit("doMes", { createdAt: new Date(Date.UTC(2026, 4, 10)) }),
        // Carteira antiga.
        unit("antiga", { createdAt: new Date(Date.UTC(2025, 0, 10)) }),
      ],
      activeTotal: 2,
      newThisMonth: 1,
      paid: { doMes: 239, antiga: 239 },
    })
  }

  it("so as indicadas DENTRO do mes entram na base de pagamento", async () => {
    arrangeCarteira("REFERRED_THIS_MONTH")

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["doMes"])
    expect(data.unitCount).toBe(1)
    expect(Number(data.baseSum)).toBe(239)
    expect(Number(data.amount)).toBe(119.5) // 239 x 50%
    expect(data.payoutBase).toBe("REFERRED_THIS_MONTH")
  })

  it("a MESMA carteira com ALL_ACTIVE paga as duas", async () => {
    arrangeCarteira("ALL_ACTIVE")

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["doMes", "antiga"])
    expect(data.unitCount).toBe(2)
    expect(Number(data.amount)).toBe(239) // 2 x 119,50
    expect(data.payoutBase).toBe("ALL_ACTIVE")
  })
})

// ---------------------------------------------------------------------------
// 5. bracketBasis: NEW_REFERRALS_MONTH vs ACTIVE_UNITS
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — bracketBasis alimenta resolveBracket", () => {
  /**
   * Faixas COM TETO: ate 2 indicacoes paga R$ 100 por unidade, acima disso R$ 200.
   * A carteira e sempre a mesma (3 unidades pagas, 5 ativas no total contando
   * cortesias, 1 indicada nova no mes) — so muda a contagem que escolhe a faixa.
   */
  function arrangeFaixas(bracketBasis: CommissionBracketBasis): void {
    arrange({
      referrers: [
        referrer({
          commissionPlan: [
            phase({
              durationMonths: null,
              rateType: "FIXED",
              bracketBasis,
              payoutBase: "ALL_ACTIVE",
              brackets: [
                { upTo: 2, value: 100 },
                { upTo: null, value: 200 },
              ],
            }),
          ],
        }),
      ],
      units: [unit("u1"), unit("u2"), unit("u3")],
      // 5 ativas no total (2 cortesias planValue=0 nao entram na lista de pagas).
      activeTotal: 5,
      newThisMonth: 1,
      // Mensalidade cheia: desde 09/09/2026 o FIXED e proporcional ao caixa, e
      // estes casos exercitam a FAIXA, nao a proporcao.
      paid: { u1: 239, u2: 239, u3: 239 },
    })
  }

  it("NEW_REFERRALS_MONTH usa as novas do mes (1) => faixa ate 2 => R$ 100", async () => {
    arrangeFaixas("NEW_REFERRALS_MONTH")

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.bracketCount).toBe(1)
    expect(Number(data.rate)).toBe(100)
    expect(Number(data.amount)).toBe(300) // 3 unidades x R$ 100
    expect(data.bracketBasis).toBe("NEW_REFERRALS_MONTH")
    for (const line of data.linesSnapshot) {
      expect(line).toMatchObject({ rateType: "FIXED", rate: 100, phaseIndex: 0 })
    }
  })

  it("ACTIVE_UNITS usa as ativas (5) => faixa sem teto => R$ 200", async () => {
    arrangeFaixas("ACTIVE_UNITS")

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.bracketCount).toBe(5)
    expect(Number(data.rate)).toBe(200)
    expect(Number(data.amount)).toBe(600) // 3 unidades x R$ 200
    expect(data.bracketBasis).toBe("ACTIVE_UNITS")
    for (const line of data.linesSnapshot) {
      expect(line).toMatchObject({ rateType: "FIXED", rate: 200, phaseIndex: 0 })
    }
  })
})

// ---------------------------------------------------------------------------
// 6. Plano truncado por parsePlan (fase intermediaria "em diante")
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — plano truncado por parsePlan", () => {
  /**
   * JSON salvo com uma fase "em diante" (`durationMonths: null`) no MEIO. Como so
   * a ultima fase pode ser aberta, `parsePlan` trunca ali e descarta o resto — o
   * motor tem de apurar com o plano de 2 fases, nunca alcancando a 3a.
   */
  const PLANO_MALFORMADO: RawPhase[] = [
    phase({
      durationMonths: 2,
      rateType: "FIXED",
      bracketBasis: "ACTIVE_UNITS",
      brackets: flat(100),
    }),
    phase({
      durationMonths: null, // fase intermediaria aberta: vira a final
      rateType: "FIXED",
      bracketBasis: "ACTIVE_UNITS",
      brackets: flat(300),
    }),
    phase({
      durationMonths: 5, // descartada pelo truncamento
      rateType: "FIXED",
      bracketBasis: "ACTIVE_UNITS",
      brackets: flat(999),
    }),
  ]

  it("o motor usa o plano truncado — a fase apos a 'em diante' nunca paga", async () => {
    arrange({
      referrers: [referrer({ commissionPlan: PLANO_MALFORMADO })],
      units: [
        unit("nova", { activatedAt: ANCHOR.mes0 }), // 0 meses => fase 0
        unit("media", { activatedAt: ANCHOR.mes3 }), // 3 meses => fase 1 (aberta)
        unit("vet", { activatedAt: ANCHOR.mes12 }), // 12 meses => fase 1 (aberta)
      ],
      activeTotal: 3,
      paid: { nova: 239, media: 239, vet: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    // 100 + 300 + 300 = 700. Se a 3a fase tivesse sobrevivido, R$ 999 apareceria.
    expect(Number(data.amount)).toBe(700)
    expect(data.unitCount).toBe(3)
    expect(lineOf(data, "nova")).toMatchObject({ phaseIndex: 0, rate: 100 })
    expect(lineOf(data, "media")).toMatchObject({ phaseIndex: 1, rate: 300 })
    expect(lineOf(data, "vet")).toMatchObject({ phaseIndex: 1, rate: 300 })
    // O plano efetivo tem 2 fases: nenhum indice 2, nenhuma aliquota 999.
    expect(data.linesSnapshot.every((l) => (l.phaseIndex ?? 0) <= 1)).toBe(true)
    expect(data.linesSnapshot.some((l) => l.rate === 999)).toBe(false)
  })

  it("plano cujas fases sao TODAS invalidas cai na regra de fase unica do indicador", async () => {
    arrange({
      referrers: [
        referrer({
          // Fases sem faixa valida sao descartadas por parsePlan => plano vazio.
          commissionPlan: [{ durationMonths: 3, brackets: [] }],
          commissionBrackets: flat(50),
          commissionRateType: "PERCENT",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.amount)).toBe(119.5)
    expect(Number(data.rate)).toBe(50)
    expect(lineOf(data, "u1")).toMatchObject({ phaseIndex: 0, rate: 50 })
  })
})
