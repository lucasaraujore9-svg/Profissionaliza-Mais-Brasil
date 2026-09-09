import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  Prisma,
  type CommissionBracketBasis,
  type CommissionMode,
  type CommissionPayoutBase,
  type CommissionRateType,
} from "@prisma/client"

// O motor mensal e 100% I/O de Prisma: mockamos o client inteiro e dirigimos o
// cenario pelos retornos (mesmo padrao de payout.test.ts / audit-saas001).
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
import { computeMonthlyCommissions, recentClosedPeriods } from "./monthly"
import { EVER_PAID_TENANT_WHERE } from "@/lib/tenants/lifecycle"
import { FALLBACK_PERCENT } from "./effective-rule"

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

const PERIOD = "2026-05"
const RANGE_START = new Date(Date.UTC(2026, 4, 1))
const RANGE_END = new Date(Date.UTC(2026, 5, 1))

interface SettingsRow {
  commissionUnifiedSince?: string | null
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
  /**
   * Discriminador do plano de TABELA (PRO R$ 239 x Profissionaliza R$ 209), que
   * e o denominador da comissao FIXED proporcional. Default `true` porque e o
   * plano de praticamente toda a rede em producao.
   */
  automationEnabled: boolean
  createdAt: Date
  activatedAt: Date | null
  commissionPlanStartedAt: Date | null
  /**
   * Campos LEGADOS de regra gravados na propria unidade INDICADA. O motor NAO
   * os le — a regra pertence ao INDICADOR (ver o bloco de regressao no fim do
   * arquivo). Eles existem aqui de proposito e sempre com valores CONFLITANTES
   * com a regra do indicador: se alguem reintroduzir a leitura do lado errado
   * do par, o valor apurado muda e os testes quebram.
   */
  referralPercent: Prisma.Decimal
  referralTiers: unknown
}

type UnitOverrides = Partial<
  Omit<UnitRow, "id" | "planValue" | "referralPercent">
> & {
  planValue?: number
  referralPercent?: number
}

function unit(id: string, over: UnitOverrides = {}): UnitRow {
  const { planValue, referralPercent, ...rest } = over
  return {
    id,
    name: `Unidade ${id}`,
    // A query de unidades filtra por ACTIVE OU "pagou na competencia"; o motor
    // le o status para nao encolher a faixa por suspensao posterior ao mes.
    status: "ACTIVE",
    planValue: new Prisma.Decimal(planValue ?? 239),
    automationEnabled: true,
    // Ancora bem anterior ao periodo apurado: por padrao a unidade entra.
    createdAt: new Date(Date.UTC(2025, 0, 10)),
    activatedAt: null,
    commissionPlanStartedAt: null,
    // Armadilha proposital: 10% e 99% NAO batem com as regras de indicador
    // usadas nos cenarios (tipicamente 50%). Qualquer leitura destes campos
    // pelo motor produz um numero diferente do esperado.
    referralPercent: new Prisma.Decimal(referralPercent ?? 10),
    referralTiers: [{ untilMonth: 1, percent: 99 }],
    ...rest,
  }
}

/** Faixa unica "em diante" — o formato que a UI grava no editor Simples. */
function flatBracket(value: number): unknown {
  return [{ upTo: null, value }]
}

// --- TenantPayment (linhas cruas que o mock de groupBy filtra) --------------

/** Pagamento do mes de uma unidade, como esta na tabela TenantPayment. */
interface PaidSpec {
  /** Valor pago. */
  amount: number
  /** Status do TenantPayment (default: RECEIVED). */
  status?: string
  /** Ja existe uma ReferralCommission legada apontando para este pagamento. */
  jaComissionada?: boolean
  /** ... e essa comissao legada esta CANCELLED (nao vale mais como paga). */
  comissaoCancelada?: boolean
  /** Quando o pagamento foi recebido (default: meio da competencia apurada). */
  paidAt?: Date
  /**
   * A que MES a mensalidade pertence — `max(vencimento, pagamento)`, gravado em
   * `TenantPayment.competenceAt`. Default: o proprio `paidAt`, que e o caso de
   * quem paga dentro do mes da fatura. Informe explicitamente para exercitar
   * antecipacao (paga em julho a fatura de agosto) ou atraso.
   */
  competenceAt?: Date
}

/** Meio do mes apurado: por padrao todo pagamento cai dentro da competencia. */
const PAID_AT_DEFAULT = new Date((RANGE_START.getTime() + RANGE_END.getTime()) / 2)

interface PaymentRow {
  tenantId: string
  amount: number
  status: string
  paidAt: Date
  competenceAt: Date
  /** Relacao 1-1 com o ledger legado; null quando o pagamento nunca gerou comissao. */
  referralCommission: { status: string } | null
}

/** Mensalidades de uma unidade: uma so, ou varias (inclusive de meses passados). */
type PaidEntry = number | PaidSpec | PaidSpec[]

function toPaymentRows(paid: Record<string, PaidEntry>): PaymentRow[] {
  return Object.entries(paid).flatMap(([tenantId, raw]) => {
    const specs: PaidSpec[] = Array.isArray(raw)
      ? raw
      : [typeof raw === "number" ? { amount: raw } : raw]
    return specs.map((spec) => {
      const temComissaoLegada =
        spec.jaComissionada === true || spec.comissaoCancelada === true
      return {
        tenantId,
        amount: spec.amount,
        status: spec.status ?? "RECEIVED",
        paidAt: spec.paidAt ?? PAID_AT_DEFAULT,
        competenceAt:
          spec.competenceAt ?? spec.paidAt ?? PAID_AT_DEFAULT,
        referralCommission: temComissaoLegada
          ? { status: spec.comissaoCancelada ? "CANCELLED" : "PENDING" }
          : null,
      }
    })
  })
}

/** Filtro de relacao aceito pelo mock (`is`/`isNot` null ou match de campo). */
interface RelationFilter {
  is?: unknown
  isNot?: unknown
  status?: string
}

interface GroupByWhere {
  tenantId?: { in: string[] }
  status?: { in: string[] }
  // A consulta do mes usa gte+lt; a de "faturas pagas antes" usa so lt.
  competenceAt?: { gte?: Date; lt?: Date }
  OR?: Array<{ referralCommission?: RelationFilter }>
}

interface GroupByArgs {
  by: string[]
  where: GroupByWhere
}

function matchReferralCommission(
  filter: RelationFilter,
  rc: PaymentRow["referralCommission"],
): boolean {
  if ("is" in filter) {
    if (filter.is === null) return rc === null
    throw new Error("mock: `is` so suporta null")
  }
  if ("isNot" in filter) {
    if (filter.isNot === null) return rc !== null
    throw new Error("mock: `isNot` so suporta null")
  }
  if (typeof filter.status === "string") return rc?.status === filter.status
  throw new Error(
    `mock: filtro de referralCommission nao suportado: ${JSON.stringify(filter)}`,
  )
}

/** Aplica o `where` REAL que a implementacao montou sobre as linhas da fixture. */
function matchesWhere(row: PaymentRow, where: GroupByWhere): boolean {
  if (where.tenantId && !where.tenantId.in.includes(row.tenantId)) return false
  if (where.status && !where.status.in.includes(row.status)) return false
  if (where.competenceAt) {
    const { gte, lt } = where.competenceAt
    if (gte && row.competenceAt < gte) return false
    if (lt && row.competenceAt >= lt) return false
  }
  if (where.OR) {
    const algumaBate = where.OR.some((cond) => {
      if (!cond.referralCommission) {
        throw new Error(`mock: condicao OR nao suportada: ${JSON.stringify(cond)}`)
      }
      return matchReferralCommission(cond.referralCommission, row.referralCommission)
    })
    if (!algumaBate) return false
  }
  return true
}

interface Scenario {
  settings?: Partial<SettingsRow>
  referrers?: ReferrerRow[]
  units?: UnitRow[]
  /**
   * Mensalidades do mes por unidade. Numero = R$ recebidos no padrao feliz;
   * objeto permite declarar status do TenantPayment e comissao legada.
   */
  paid?: Record<string, PaidEntry>
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
    async (args: { where: Record<string, unknown> }) => {
      if (args.where.referrals) return referrers
      // O mock HONRA o `where` do universo de unidades: planValue > 0 e
      // "ACTIVE OU pagou na competencia". Sem isso, trocar esse filtro na
      // implementacao nao quebraria teste nenhum — foi assim que a suspensao
      // posterior ao mes apagava a comissao sem ninguem perceber.
      const or = args.where.OR as
        | [{ status: string }, { id: { in: string[] } }]
        | undefined
      const status = args.where.status as string | undefined
      const paidIds = new Set(or?.[1]?.id?.in ?? [])
      return units.filter((u) => {
        if (Number(u.planValue) <= 0) return false
        // `status` sozinho (sem o OR) e exatamente o filtro que apagava a
        // unidade suspensa DEPOIS de pagar — o mock precisa reproduzi-lo para
        // que reintroduzir esse bug quebre o teste.
        if (status) return u.status === status
        if (or) return u.status === "ACTIVE" || paidIds.has(u.id)
        return true
      })
    },
  )
  // Os dois count: o do mes filtra por activatedAt, o total nao.
  db.tenant.count.mockImplementation(
    async (args: { where: Record<string, unknown> }) => {
      // "Novas do mes" e contado por COALESCE(activatedAt, createdAt) na
      // competencia — no Prisma isso vira um `OR` de dois ramos. O total da
      // carteira nao tem filtro de data.
      //
      // Discriminamos pelo `OR`, e os DOIS counts exigem `planValue > 0` (o
      // filtro que impede cortesia de empurrar a faixa): se a implementacao
      // deixar de mandar esse filtro, o mock lanca e o teste quebra.
      expect(args.where.planValue).toEqual({ gt: 0 })
      if (args.where.OR) {
        // Ramo "novas do mes": contrato desfeito nao conta como venda.
        expect(args.where.status).toEqual({ not: "CANCELLED" })
        // O fallback por `createdAt` (para quem ativou sem o timestamp ser
        // gravado) SO pode valer para unidade ACTIVE — senao quem nunca ativou
        // entraria como venda do mes. Ver o teste de regressao adiante.
        const [porAtivacao, porCriacao] = args.where.OR as [
          Record<string, unknown>,
          Record<string, unknown>,
        ]
        expect(porAtivacao.activatedAt).toBeDefined()
        expect(porCriacao).toMatchObject({ activatedAt: null, status: "ACTIVE" })
        return s.newThisMonth ?? 0
      }
      expect(args.where.status).toBe("ACTIVE")
      return s.activeTotal ?? units.length
    },
  )
  db.referralMonthlyCommission.findUnique.mockResolvedValue(s.existing ?? null)
  // O mock HONRA o `where` que a implementacao monta (ids, status e o OR de
  // anti-duplicidade): as linhas cruas ficam na fixture e quem decide o que
  // volta e o filtro real do motor — nao o teste.
  const rows = toPaymentRows(s.paid ?? {})
  // Mensalidades do mes, fatura a fatura (o motor precisa da data de cada uma).
  db.tenantPayment.findMany.mockImplementation(async (args: GroupByArgs) => {
    const where = args.where as Record<string, unknown>
    // Descoberta de "quem pagou na competencia": filtra so por status + janela.
    if (where.tenant) {
      return rows
        .filter(
          (row) =>
            ["RECEIVED", "CONFIRMED"].includes(row.status) &&
            row.competenceAt >= RANGE_START &&
            row.competenceAt < RANGE_END,
        )
        .map((row) => ({ tenantId: row.tenantId }))
    }
    return rows
      .filter((row) => matchesWhere(row, args.where))
      .sort((a, b) => a.competenceAt.getTime() - b.competenceAt.getTime())
      .map((row) => ({
        tenantId: row.tenantId,
        amount: new Prisma.Decimal(row.amount),
        competenceAt: row.competenceAt,
        // O motor decide a elegibilidade em codigo (nao mais no `where`), entao
        // o mock precisa devolver a relacao como o Prisma devolveria.
        referralCommission: row.referralCommission,
      }))
  })
  // Contagem de faturas pagas ANTES da competencia (relogio por fatura).
  db.tenantPayment.groupBy.mockImplementation(async (args: GroupByArgs) => {
    const porTenant = new Map<string, number>()
    for (const row of rows.filter((r) => matchesWhere(r, args.where))) {
      porTenant.set(row.tenantId, (porTenant.get(row.tenantId) ?? 0) + 1)
    }
    return [...porTenant].map(([tenantId, n]) => ({
      tenantId,
      _count: { _all: n },
    }))
  })
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

function expectNothingWritten(): void {
  expect(db.referralMonthlyCommission.create).not.toHaveBeenCalled()
  expect(db.referralMonthlyCommission.update).not.toHaveBeenCalled()
  expect(db.referralMonthlyCommission.delete).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// 1. recentClosedPeriods (pura)
// ---------------------------------------------------------------------------

describe("recentClosedPeriods", () => {
  it("devolve os N meses FECHADOS, do mais antigo ao mais novo", () => {
    expect(recentClosedPeriods(new Date("2026-07-20T12:00:00Z"), 3)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ])
  })

  it("com count=1 devolve apenas o mes anterior (nunca o mes corrente)", () => {
    expect(recentClosedPeriods(new Date("2026-07-01T00:00:00Z"), 1)).toEqual([
      "2026-06",
    ])
  })

  it("atravessa a virada de ano", () => {
    expect(recentClosedPeriods(new Date("2026-02-10T00:00:00Z"), 4)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
    ])
  })

  it("nao estoura em mes de 31 dias voltando para fevereiro", () => {
    // 31/03 - 1 mes daria 03/03 se nao normalizasse para o dia 1.
    expect(recentClosedPeriods(new Date("2026-03-31T23:59:59Z"), 2)).toEqual([
      "2026-01",
      "2026-02",
    ])
  })

  it("count=0 devolve lista vazia", () => {
    expect(recentClosedPeriods(new Date("2026-07-20T12:00:00Z"), 0)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 2. Portao de minimo de indicacoes (regra portada do motor legado)
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — portao de minimo de indicacoes", () => {
  it("retem a competencia quando o indicador tem menos ativas que o minimo", async () => {
    arrange({
      referrers: [
        referrer({
          referralMinReferrals: 3,
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1"), unit("u2")],
      activeTotal: 2,
      paid: { u1: 239, u2: 239 },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toEqual({ processed: 1, created: 0, updated: 0, skipped: 1 })
    expectNothingWritten()
  })

  it("apura assim que o minimo e atingido", async () => {
    arrange({
      referrers: [
        referrer({
          referralMinReferrals: 3,
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1"), unit("u2"), unit("u3")],
      activeTotal: 3,
      paid: { u1: 239, u2: 239, u3: 239 },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toMatchObject({ processed: 1, created: 1, skipped: 0 })
    expect(Number(created().amount)).toBe(358.5)
  })

  it("sem override, o minimo vem de defaultReferralMinReferrals", async () => {
    arrange({
      settings: { defaultReferralMinReferrals: 3 },
      referrers: [
        referrer({
          referralMinReferrals: null,
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1"), unit("u2")],
      activeTotal: 2,
      paid: { u1: 239, u2: 239 },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toMatchObject({ created: 0, skipped: 1 })
    expectNothingWritten()
  })

  it("override 0 significa SEM minimo e vence o padrao global", async () => {
    arrange({
      settings: { defaultReferralMinReferrals: 5 },
      referrers: [
        referrer({
          referralMinReferrals: 0,
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: 239 },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toMatchObject({ created: 1 })
    expect(Number(created().amount)).toBe(119.5)
  })

  it("competencia retida que ja tinha linha PENDING e removida", async () => {
    arrange({
      referrers: [
        referrer({
          referralMinReferrals: 3,
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      existing: { id: "rmc-old", status: "PENDING", payoutId: null },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toMatchObject({ updated: 1 })
    expect(db.referralMonthlyCommission.delete).toHaveBeenCalledWith({
      where: { id: "rmc-old" },
    })
    expect(db.referralMonthlyCommission.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 3. Idempotencia
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — idempotencia", () => {
  const cases: Array<[string, { id: string; status: string; payoutId: string | null }]> = [
    ["AVAILABLE", { id: "rmc1", status: "AVAILABLE", payoutId: null }],
    ["PAID", { id: "rmc1", status: "PAID", payoutId: null }],
    ["PENDING mas ja vinculada a um payout", { id: "rmc1", status: "PENDING", payoutId: "pay1" }],
  ]

  for (const [label, existing] of cases) {
    it(`nao recalcula competencia ${label}`, async () => {
      arrange({
        referrers: [
          referrer({
            commissionBrackets: flatBracket(50),
            commissionRateType: "PERCENT",
          }),
        ],
        units: [unit("u1")],
        paid: { u1: 239 },
        existing,
      })

      const out = await computeMonthlyCommissions(PERIOD)

      expect(out).toEqual({ processed: 1, created: 0, updated: 0, skipped: 1 })
      expectNothingWritten()
      // Sai antes de qualquer leitura de base — nao ha custo nem risco de
      // encolher um valor que a revenda ja viu.
      expect(db.tenant.count).not.toHaveBeenCalled()
      expect(db.tenantPayment.findMany).not.toHaveBeenCalled()
    })
  }

  it("recalcula (update) competencia PENDING sem payout", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1")],
      paid: { u1: 239 },
      existing: { id: "rmc1", status: "PENDING", payoutId: null },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toMatchObject({ updated: 1, created: 0 })
    expect(db.referralMonthlyCommission.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rmc1" } }),
    )
  })
})

// ---------------------------------------------------------------------------
// 4. PERCENT — o caso real (5 x R$ 239 a 50%)
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — PERCENT", () => {
  it("5 unidades de R$ 239 a 50% = R$ 597,50", async () => {
    const units = ["u1", "u2", "u3", "u4", "u5"].map((id) => unit(id, { planValue: 239 }))
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units,
      activeTotal: 5,
      paid: Object.fromEntries(units.map((u) => [u.id, 239])),
    })

    const out = await computeMonthlyCommissions(PERIOD)
    expect(out).toMatchObject({ processed: 1, created: 1 })

    const data = created()
    expect(Number(data.amount)).toBe(597.5)
    expect(data.unitCount).toBe(5)
    expect(Number(data.baseSum)).toBe(1195)
    expect(data.rateType).toBe("PERCENT")
    expect(Number(data.rate)).toBe(50)
    expect(data.bracketCount).toBe(5)
    // Liberacao: dia 20 do mes seguinte a competencia.
    expect(data.availableAt.toISOString()).toBe("2026-06-20T00:00:00.000Z")

    // Uma linha por unidade, com a quebra fiel do demonstrativo.
    expect(data.linesSnapshot).toHaveLength(5)
    for (const line of data.linesSnapshot) {
      expect(line).toMatchObject({
        mensalidade: 239,
        amount: 119.5,
        rateType: "PERCENT",
        rate: 50,
      })
    }
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual([
      "u1",
      "u2",
      "u3",
      "u4",
      "u5",
    ])
  })

  it("unidade sem mensalidade recebida no mes nao entra na comissao", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1"), unit("u2")],
      activeTotal: 2,
      paid: { u1: 239 }, // u2 nao pagou
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.unitCount).toBe(1)
    expect(Number(data.amount)).toBe(119.5)
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1"])
  })
})

// ---------------------------------------------------------------------------
// 5. Anti-duplicidade com o ledger legado
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — anti-duplicidade", () => {
  it("mensalidade ja coberta por ReferralCommission ativa fica de fora; com a legada CANCELLED ela volta a contar", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1"), unit("u2"), unit("u3")],
      activeTotal: 3,
      // As TRES pagaram R$ 239 no mes. A diferenca esta so no ledger legado.
      paid: {
        u1: { amount: 239 },
        u2: { amount: 239, jaComissionada: true },
        u3: { amount: 239, jaComissionada: true, comissaoCancelada: true },
      },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    // u2 sai: o motor legado ja pagou por essa mensalidade — pagar de novo aqui
    // seria duplicidade. u3 volta: cancelar a linha legada e exatamente o
    // mecanismo em que o recalculo retroativo de producao se apoia para
    // devolver a mensalidade ao motor mensal.
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1", "u3"])
    expect(data.unitCount).toBe(2)
    expect(Number(data.baseSum)).toBe(478)
    expect(Number(data.amount)).toBe(239)
  })

  it("pagamento com status fora de RECEIVED/CONFIRMED nao entra no somatorio", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1"), unit("u2"), unit("u3")],
      activeTotal: 3,
      paid: {
        u1: { amount: 239 }, // RECEIVED (padrao)
        u2: { amount: 239, status: "CONFIRMED" }, // tambem conta
        u3: { amount: 239, status: "PENDING" }, // boleto emitido e nao pago
      },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1", "u2"])
    expect(data.unitCount).toBe(2)
    expect(Number(data.baseSum)).toBe(478)
    expect(Number(data.amount)).toBe(239)
  })
})

// ---------------------------------------------------------------------------
// 6. Clamp do catch-up (unidade que entrou depois do mes apurado)
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — clamp do catch-up", () => {
  it("unidade cuja ancora e posterior ao mes apurado nao entra na competencia", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [
        // Ativada ANTES do mes apurado: entra.
        unit("u1", { activatedAt: new Date(Date.UTC(2026, 2, 15)) }),
        // Ativada DEPOIS (junho) — ainda nao existia na competencia de maio.
        unit("u2", { activatedAt: new Date(Date.UTC(2026, 5, 3)) }),
        // commissionPlanStartedAt tem precedencia sobre activatedAt.
        unit("u3", {
          activatedAt: new Date(Date.UTC(2026, 0, 5)),
          commissionPlanStartedAt: new Date(Date.UTC(2026, 6, 1)),
        }),
      ],
      activeTotal: 3,
      // As tres pagaram no mes: a exclusao e pela ancora, nao pelo pagamento.
      paid: { u1: 239, u2: 239, u3: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1"])
    expect(data.unitCount).toBe(1)
    expect(Number(data.amount)).toBe(119.5)
  })

  it("unidade ativada DENTRO do mes apurado entra normalmente", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
        }),
      ],
      units: [unit("u1", { activatedAt: new Date(Date.UTC(2026, 4, 20)) })],
      activeTotal: 1,
      paid: { u1: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    expect(created().linesSnapshot.map((l) => l.tenantId)).toEqual(["u1"])
  })
})

// ---------------------------------------------------------------------------
// 7. FIXED
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — FIXED e PROPORCIONAL ao caixa do mes", () => {
  /**
   * CONTRATO NOVO (decisao do dono, 09/09/2026). Ate aqui o valor fixo era pago
   * inteiro por qualquer unidade ATIVA, sem olhar caixa — este bloco chamava-se
   * "paga R$ por unidade ativa, INDEPENDENTE de pagamento no mes" e afirmava
   * exatamente o oposto do que se lê agora.
   *
   * A troca e deliberada e tem duas razoes: unidade que nao pagou no mes fazia o
   * programa remunerar inadimplencia, e unidade com cortesia de 50% pagava
   * metade para a PMB enquanto o indicador levava a faixa cheia.
   */
  it("paga a faixa CHEIA para quem pagou a mensalidade cheia", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1"), unit("u2"), unit("u3")],
      activeTotal: 3,
      paid: { u1: 239, u2: 239, u3: 239 },
    })

    const out = await computeMonthlyCommissions(PERIOD)
    expect(out).toMatchObject({ created: 1 })

    const data = created()
    expect(Number(data.amount)).toBe(150)
    expect(data.unitCount).toBe(3)
    expect(data.rateType).toBe("FIXED")
    expect(Number(data.rate)).toBe(50)
    expect(data.linesSnapshot).toHaveLength(3)
    expect(data.linesSnapshot[0]).toMatchObject({
      // O RECEBIDO no mes, nao o `planValue`: e o numerador da proporcao e o
      // unico numero que explica a linha.
      mensalidade: 239,
      amount: 50,
      rateType: "FIXED",
    })
  })

  it("unidade ATIVA que nao pagou no mes nao gera comissao NEM linha", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1"), unit("u2")],
      activeTotal: 2,
      paid: { u1: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.amount)).toBe(50)
    expect(data.unitCount).toBe(1)
    // Linha de R$ 0 leria como "entrou na conta e nao valeu nada"; o certo e
    // nao ter entrado, e o relatorio explica a ausencia.
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1"])
  })

  it("cortesia de 50% paga METADE da faixa — o caso que motivou a regra", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1", { planValue: 119.5 })],
      activeTotal: 1,
      paid: { u1: 119.5 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.amount)).toBe(25)
    expect(data.linesSnapshot[0]).toMatchObject({ mensalidade: 119.5, amount: 25 })
  })

  it("o denominador e o preco de TABELA, nao o planValue com desconto", async () => {
    // A trava que impede a regra de virar no-op: `planValue` E onde a cortesia
    // fica gravada. Se ele fosse o denominador, 119,50/119,50 = 1 e a unidade
    // com metade do preco pagaria a faixa inteira.
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1", { planValue: 119.5 })],
      activeTotal: 1,
      paid: { u1: 119.5 },
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).not.toBe(50)
  })

  it("unidade sem o modulo Automacao usa a base de R$ 209", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(100),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1", { automationEnabled: false })],
      activeTotal: 1,
      paid: { u1: 104.5 }, // metade de 209
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(50)
  })

  it("duas mensalidades na mesma competencia valem DUAS faixas", async () => {
    // A atrasada do mes anterior + a do mes: duas receitas. Este caso ja
    // afirmou o CONTRARIO ("duas faturas no mesmo mes nao dobram a comissao") —
    // um teto sobre a soma apagava para sempre a mensalidade que atrasou, que
    // por ter atrasado tambem nao gerou comissao no mes dela.
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: [{ amount: 239 }, { amount: 239 }] },
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(100)
  })

  it("juros na fatura atrasada nao pagam faixa extra", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(50),
          commissionRateType: "FIXED",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: { amount: 268 } }, // 239 + multa e juros
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// 8. Regressao: nao existe mais desvio pelo motor legado
// ---------------------------------------------------------------------------

describe("computeMonthlyCommissions — motor unico", () => {
  it("indicador com commissionMode legado PER_PAYMENT_PERCENT TAMBEM e apurado aqui", async () => {
    arrange({
      // Sem nenhuma regra configurada: cai no percentual padrao global.
      settings: { defaultReferralPercent: 30, commissionBrackets: [] },
      referrers: [referrer({ commissionMode: "PER_PAYMENT_PERCENT" })],
      units: [unit("u1", { planValue: 200 })],
      activeTotal: 1,
      paid: { u1: 200 },
    })

    const out = await computeMonthlyCommissions(PERIOD)

    // Antes da unificacao este indicador era PULADO aqui e o motor legado ja
    // era no-op: ficava sem receber por nenhum dos dois.
    expect(out).toMatchObject({ processed: 1, created: 1, skipped: 0 })
    const data = created()
    expect(Number(data.amount)).toBe(60)
    expect(Number(data.rate)).toBe(30)
    expect(data.mode).toBe("MONTHLY_TIERED")
  })

  it("indicador sem NENHUMA regra e sem percentual padrao cai no FALLBACK_PERCENT do modulo", async () => {
    arrange({
      settings: { defaultReferralPercent: null, commissionBrackets: [] },
      referrers: [referrer({ commissionMode: "PER_PAYMENT_PERCENT" })],
      units: [unit("u1", { planValue: 200 })],
      activeTotal: 1,
      paid: { u1: 200 },
    })

    await computeMonthlyCommissions(PERIOD)

    // O percentual vem do FALLBACK_PERCENT do resolvedor (alinhado ao @default
    // do schema). Derivamos o esperado da constante em vez de repetir o numero:
    // um dia ela muda, e o que este teste protege e a MECANICA (o motor cai no
    // fallback e apura), nao o valor literal — quem trava o valor e
    // effective-rule.test.ts.
    const data = created()
    expect(Number(data.rate)).toBe(FALLBACK_PERCENT)
    expect(Number(data.amount)).toBe((200 * FALLBACK_PERCENT) / 100)
  })

  it("programa desligado (referralEnabled=false) nao apura ninguem", async () => {
    arrange({
      settings: { referralEnabled: false },
      referrers: [referrer({ commissionBrackets: flatBracket(50) })],
      units: [unit("u1")],
    })

    const out = await computeMonthlyCommissions(PERIOD)

    expect(out).toEqual({ processed: 0, created: 0, updated: 0, skipped: 0 })
    expect(db.tenant.findMany).not.toHaveBeenCalled()
    expectNothingWritten()
  })

  it("period fora do formato AAAA-MM e rejeitado", async () => {
    arrange()
    await expect(computeMonthlyCommissions("2026-13")).rejects.toThrow(/period invalido/)
    await expect(computeMonthlyCommissions("maio/2026")).rejects.toThrow(/period invalido/)
  })
})

// ---------------------------------------------------------------------------
// 9. Regressao do bug historico: de que LADO do par a regra e lida
// ---------------------------------------------------------------------------

/**
 * BUG HISTORICO — o motivo de este bloco existir.
 *
 * `Tenant.referralPercent` sempre foi gravado na tela do tenant INDICADOR
 * ("a revenda X recebe 50% do que as indicadas dela pagarem"), mas o motor
 * legado lia esse mesmo campo do tenant INDICADO:
 *
 *     // commission.ts, codigo ANTIGO (removido na unificacao)
 *     const percent = tierPercent ?? referred.referralPercent ?? settings.defaultPercent
 *     //                             ^^^^^^^^ lado ERRADO do par (indicador, indicado)
 *
 * Como nenhuma unidade INDICADA tinha o campo preenchido, tudo caia no padrao
 * global de 10%: o indicador configurado com 50% recebia R$ 23,90 em vez de
 * R$ 119,50 sobre uma mensalidade de R$ 239 — silenciosamente, sem erro nem log.
 *
 * Hoje a regra vem SO do indicador (resolveEffectiveCommission -> phases). Para
 * que a protecao seja real e nao teatral, a fixture `unit()` grava em TODA
 * unidade indicada uma regra legada conflitante (`referralPercent` 10 e
 * `referralTiers` de 99%). Se alguem reintroduzir a leitura do lado errado, os
 * numeros abaixo mudam e estes testes falham.
 */
describe("computeMonthlyCommissions — regressao: a regra e do INDICADOR", () => {
  it("a regra vem do INDICADOR, nunca da unidade indicada", async () => {
    const units = ["u1", "u2", "u3"].map((id) =>
      unit(id, { planValue: 239, referralPercent: 10 }),
    )
    // Guarda da propria fixture: se ela parar de gravar a regra conflitante na
    // indicada, este teste vira teatro (foi exatamente o que uma revisao por
    // mutacao pegou) — entao o conflito e verificado explicitamente.
    for (const u of units) {
      expect(Number(u.referralPercent)).toBe(10)
    }

    arrange({
      // Padrao global tambem em 10%: se o motor ler a indicada OU o padrao, o
      // numero e o mesmo 23,90 — o unico jeito de chegar em 119,50 e lendo o
      // indicador.
      settings: { defaultReferralPercent: 10, commissionBrackets: [] },
      referrers: [
        referrer({
          // A UNICA regra de 50% do cenario esta no INDICADOR.
          commissionBrackets: flatBracket(50),
          commissionRateType: "PERCENT",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units,
      activeTotal: 3,
      paid: { u1: 239, u2: 239, u3: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    // 50% do indicador — nunca os 10% gravados na indicada.
    expect(Number(data.rate)).toBe(50)
    expect(Number(data.amount)).toBe(358.5)
    expect(Number(data.amount)).not.toBe(71.7) // 3 x 23,90 (bug historico)
    for (const line of data.linesSnapshot) {
      expect(line.rate).toBe(50)
      expect(line.amount).toBe(119.5)
      expect(line.amount).not.toBe(23.9)
    }
  })

  it("referralTiers agressivo na indicada nao vence a regra global do indicador", async () => {
    // Indicador sem plano/faixas proprias -> vale a regra global (30%).
    // A indicada tem uma escala legada de 99% e um percentual proprio de 10%:
    // nenhum dos dois pode influenciar o fechamento.
    const u1 = unit("u1", {
      planValue: 200,
      referralPercent: 10,
      referralTiers: [{ untilMonth: 1, percent: 99 }],
    })

    arrange({
      settings: { defaultReferralPercent: 30, commissionBrackets: [] },
      referrers: [
        referrer({
          commissionPlan: null,
          commissionBrackets: null,
          commissionRateType: null,
        }),
      ],
      units: [u1],
      activeTotal: 1,
      paid: { u1: 200 },
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.rate)).toBe(30)
    expect(Number(data.amount)).toBe(60) // 30% de R$ 200
    expect(Number(data.amount)).not.toBe(198) // 99% da escala legada da indicada
    expect(Number(data.amount)).not.toBe(20) // 10% do referralPercent da indicada
  })
})

// ---------------------------------------------------------------------------
// Contratos reais (CDA e INOVASUL) — os numeros vieram da producao em 20/07/26.
// Cada caso aqui e uma clausula de contrato; se um deles quebrar, alguem esta
// recebendo o valor errado de verdade.
// ---------------------------------------------------------------------------

describe("corte do motor unico (commissionUnifiedSince)", () => {
  // Junho/2026 foi liquidado pelo ledger legado e pago a mao. Sem o corte, o
  // catch-up de 3 meses do cron reapuraria junho e criaria uma segunda comissao
  // sobre dinheiro que ja saiu do caixa.
  it("nao apura competencia anterior ao corte", async () => {
    arrange({
      settings: { commissionUnifiedSince: "2026-07" },
      referrers: [referrer({ commissionBrackets: [{ upTo: null, value: 75 }] })],
      units: [unit("u1")],
    })

    const r = await computeMonthlyCommissions("2026-06")

    expect(r).toEqual({ processed: 0, created: 0, updated: 0, skipped: 0 })
    expect(db.referralMonthlyCommission.create).not.toHaveBeenCalled()
  })

  it("apura a competencia do corte em diante", async () => {
    arrange({
      settings: { commissionUnifiedSince: "2026-05" },
      referrers: [
        referrer({
          commissionBrackets: [{ upTo: null, value: 75 }],
          commissionRateType: "FIXED",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units: [unit("u1")],
      paid: { u1: 239 }, // FIXED e proporcional ao caixa: sem pagamento, zero
    })

    await computeMonthlyCommissions(PERIOD) // 2026-05

    expect(Number(created().amount)).toBe(75)
  })

  it("sem corte configurado, apura qualquer competencia", async () => {
    arrange({
      settings: { commissionUnifiedSince: null },
      referrers: [
        referrer({
          commissionBrackets: [{ upTo: null, value: 75 }],
          commissionRateType: "FIXED",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units: [unit("u1")],
      paid: { u1: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(75)
  })
})

describe("contrato CARREIRA DIGITAL — faixa pelas ATIVACOES do mes, R$ sobre a carteira", () => {
  // Contrato: o GATILHO e quantas revendas foram ATIVADAS no mes; o VALOR incide
  // sobre TODA a carteira ativa.
  //   ate 10 ativacoes -> R$ 75 por revenda ativa
  //   11 a 25          -> R$ 85 por revenda ativa
  //   26+              -> R$ 100 por revenda ativa
  const FAIXAS = [
    { upTo: 10, value: 75 },
    { upTo: 25, value: 85 },
    { upTo: null, value: 100 },
  ]

  /**
   * `paid` default = mensalidade CHEIA de todas as unidades. Desde que a
   * comissao FIXED virou proporcional ao caixa (09/09/2026), unidade sem
   * pagamento no mes vale zero — e estes casos existem para exercitar a FAIXA,
   * nao a proporcao. Quem testa a proporcao passa `paid` explicitamente.
   */
  function cda(
    units: UnitRow[],
    newThisMonth: number,
    activeTotal = units.length,
    paid?: Record<string, PaidEntry>,
  ) {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: FAIXAS,
          commissionRateType: "FIXED",
          commissionBracketBasis: "NEW_REFERRALS_MONTH",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units,
      newThisMonth,
      activeTotal,
      paid: paid ?? Object.fromEntries(units.map((u) => [u.id, 239])),
    })
  }

  // Competencia real de junho/2026: 1 unica ativacao no mes e 1 unica revenda na
  // carteira. Foi o que o financeiro pagou a mao (R$ 75,00).
  it("junho/2026 reproduzido: 1 ativacao, carteira de 1 => R$ 75", async () => {
    cda([unit("u1")], 1)

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.rate)).toBe(75)
    expect(data.unitCount).toBe(1)
    expect(Number(data.amount)).toBe(75)
  })

  // Competencia real de julho/2026: 6 ativacoes no mes, carteira de 7.
  it("julho/2026 reproduzido: 6 ativacoes, carteira de 7 => 7 x R$ 75 = R$ 525", async () => {
    const units = ["u1", "u2", "u3", "u4", "u5", "u6", "u7"].map((id) => unit(id))
    cda(units, 6)

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.rate)).toBe(75)
    expect(data.bracketCount).toBe(6) // a faixa olha as ATIVACOES do mes
    expect(data.unitCount).toBe(7) // o valor incide sobre a carteira toda
    expect(Number(data.amount)).toBe(525)
  })

  it("o valor DEPENDE de quem pagou no mes: quem nao pagou nao remunera", async () => {
    // Este caso afirmava o CONTRARIO ate 09/09/2026 ("a carteira inteira
    // remunera, tenha pago ou nao"). O dono inverteu a clausula: a comissao e
    // rateio de receita, e sem receita nao ha o que ratear.
    const units = ["u1", "u2", "u3"].map((id) => unit(id))
    cda(units, 2, units.length, { u1: 239, u2: 239 })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.amount)).toBe(150) // 2 x R$ 75; u3 nao pagou
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1", "u2"])
  })

  it("11 ativacoes no mes sobem a faixa para R$ 85 em TODA a carteira", async () => {
    const units = Array.from({ length: 15 }, (_, i) => unit(`u${i + 1}`))
    cda(units, 11)

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.rate)).toBe(85)
    expect(Number(data.amount)).toBe(15 * 85)
  })

  it("26 ativacoes no mes sobem a faixa para R$ 100", async () => {
    const units = Array.from({ length: 30 }, (_, i) => unit(`u${i + 1}`))
    cda(units, 26)

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.rate)).toBe(100)
    expect(Number(data.amount)).toBe(30 * 100)
  })

  it("carteira grande sem ativacao no mes fica na faixa de entrada", async () => {
    const units = Array.from({ length: 30 }, (_, i) => unit(`u${i + 1}`))
    // 30 revendas ativas, nenhuma ativada NESTE mes => faixa 0-10 (R$ 75).
    cda(units, 0)

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.rate)).toBe(75)
    expect(Number(data.amount)).toBe(30 * 75)
  })

  // Caso real: a BE Educacional pagou junho e so em 18/07 ficou inadimplente,
  // virando SUSPENDED pelo webhook do Asaas. Como o fechamento roda depois disso
  // (e o cron reapura 3 meses), montar o universo so com `status: ACTIVE`
  // apagaria a comissao de um mes ja fechado. Ativacao/pagamento sao fatos.
  it("unidade que pagou na competencia e foi suspensa DEPOIS continua contando", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: FAIXAS,
          commissionRateType: "FIXED",
          commissionBracketBasis: "NEW_REFERRALS_MONTH",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units: [unit("u1", { status: "SUSPENDED" }), unit("u2")],
      paid: { u1: 239, u2: 239 },
      newThisMonth: 1,
      activeTotal: 1, // ativas HOJE: so a u2 sobrou
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.amount)).toBe(150) // 2 x R$ 75, e nao 75
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1", "u2"])
  })

  it("unidade suspensa que NAO pagou na competencia fica de fora", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: FAIXAS,
          commissionRateType: "FIXED",
          commissionBracketBasis: "NEW_REFERRALS_MONTH",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units: [unit("u1", { status: "SUSPENDED" }), unit("u2")],
      paid: { u2: 239 }, // so a ativa pagou
      newThisMonth: 1,
      activeTotal: 1,
    })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(Number(data.amount)).toBe(75)
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u2"])
  })
})
describe("contrato INOVASUL — 50% da 1a fatura paga, 10% nas demais", () => {
  /** Janela promocional do contrato: 1a fatura paga ate 15/12/2026. */
  const PROMO_ATE = "2026-12-15T23:59:59.999Z"

  function inovasul(
    units: UnitRow[],
    paid: Record<string, PaidEntry>,
    promoPaidUntil: string | null = PROMO_ATE,
  ) {
    arrange({
      referrers: [
        referrer({
          commissionPlan: {
            clock: "paidInvoices",
            ...(promoPaidUntil ? { promoPaidUntil } : {}),
            phases: [
              {
                durationMonths: 1, // 1 FATURA, nao 1 mes
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 50 }],
              },
              {
                durationMonths: null,
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 10 }],
              },
            ],
          },
        }),
      ],
      units,
      paid,
      activeTotal: units.length,
    })
  }

  it("1a fatura da unidade => 50% (o caso da BE Educacional: R$119,50)", async () => {
    inovasul([unit("be")], { be: 239 })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(119.5)
  })

  it("2a fatura em diante => 10%", async () => {
    // Uma fatura paga ANTES da competencia ja consumiu a fase promocional.
    inovasul([unit("be")], {
      be: [
        { amount: 239, paidAt: new Date(Date.UTC(2026, 3, 15)) }, // abril
        { amount: 239 }, // no mes apurado
      ],
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(23.9)
  })

  it("1a fatura ATRASADA continua valendo 50% (relogio e por fatura, nao por mes)", async () => {
    // Unidade ativa desde janeiro, mas so pagou a 1a fatura agora (maio).
    inovasul([unit("atrasada", { activatedAt: new Date(Date.UTC(2026, 0, 10)) })], {
      atrasada: 239,
    })

    await computeMonthlyCommissions(PERIOD)

    // Com relogio por MES a unidade estaria no 5o mes de vida => 10% (R$23,90).
    expect(Number(created().amount)).toBe(119.5)
  })

  it("janela: 1a fatura paga DEPOIS de 15/12/2026 cai para 10%", async () => {
    inovasul([unit("tardia")], {
      tardia: { amount: 239, paidAt: new Date(Date.UTC(2026, 11, 20)) },
    })

    // Competencia dezembro/2026, onde o corte parte o mes ao meio.
    await computeMonthlyCommissions("2026-12")

    expect(Number(created().amount)).toBe(23.9)
  })

  it("DEZEMBRO/2026: 10/12 leva 50% e 20/12 leva 10% na MESMA competencia", async () => {
    inovasul([unit("antes"), unit("depois")], {
      antes: { amount: 239, paidAt: new Date(Date.UTC(2026, 11, 10)) },
      depois: { amount: 239, paidAt: new Date(Date.UTC(2026, 11, 20)) },
    })

    await computeMonthlyCommissions("2026-12")

    const data = created()
    // 119,50 + 23,90 — o caso que qualquer implementacao que agregue o mes erra.
    expect(Number(data.amount)).toBe(143.4)
    const porUnidade = Object.fromEntries(
      data.linesSnapshot.map((l) => [l.tenantId, l.amount]),
    )
    expect(porUnidade.antes).toBe(119.5)
    expect(porUnidade.depois).toBe(23.9)
  })

  it("sem janela configurada a promocao nao expira", async () => {
    inovasul(
      [unit("tardia")],
      { tardia: { amount: 239, paidAt: new Date(Date.UTC(2026, 11, 20)) } },
      null,
    )

    await computeMonthlyCommissions("2026-12")

    expect(Number(created().amount)).toBe(119.5)
  })
})

describe("PERCENT: arredondamento nao muda por causa da granularidade de fatura", () => {
  it("3 faturas de R$33,33 a 10% => R$10,00 (soma antes de arredondar)", async () => {
    arrange({
      referrers: [referrer({ commissionBrackets: flatBracket(10) })],
      units: [unit("u1")],
      activeTotal: 1,
      paid: {
        u1: [{ amount: 33.33 }, { amount: 33.33 }, { amount: 33.33 }],
      },
    })

    await computeMonthlyCommissions(PERIOD)

    // Arredondando fatura a fatura sairia 3,33 x 3 = 9,99 — um centavo a menos
    // do que o motor sempre pagou. A base do mes e somada ANTES do percentual.
    expect(Number(created().amount)).toBe(10)
  })

  it("centavos: 3 faturas de R$0,05 a 33% => R$0,05", async () => {
    arrange({
      referrers: [referrer({ commissionBrackets: flatBracket(33) })],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: [{ amount: 0.05 }, { amount: 0.05 }, { amount: 0.05 }] },
    })

    await computeMonthlyCommissions(PERIOD)

    // 0,15 x 33% = 0,0495 => 0,05. Por fatura seria 0,02 x 3 = 0,06.
    expect(Number(created().amount)).toBe(0.05)
  })
})

describe("achados da revisao adversarial (regressoes travadas)", () => {
  it("fatura ja comissionada pelo legado NAO desloca o ordinal da seguinte", async () => {
    // Mes de transicao entre motores: a 1a fatura do mes ja tem ReferralCommission
    // viva. A 2a e a SEGUNDA da unidade — nao pode receber o percentual de entrada.
    arrange({
      referrers: [
        referrer({
          commissionPlan: {
            clock: "paidInvoices",
            phases: [
              {
                durationMonths: 1,
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 50 }],
              },
              {
                durationMonths: null,
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 10 }],
              },
            ],
          },
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: {
        u1: [
          { amount: 239, paidAt: new Date(Date.UTC(2026, 4, 5)), jaComissionada: true },
          { amount: 239, paidAt: new Date(Date.UTC(2026, 4, 25)) },
        ],
      },
    })

    await computeMonthlyCommissions(PERIOD)

    // 10% da 2a fatura. Contar so as elegiveis daria 50% (R$119,50) em cima de
    // uma comissao legada que ja existe.
    expect(Number(created().amount)).toBe(23.9)
  })

  it("plano que mistura PERCENT e FIXED nao le R$ como %", async () => {
    arrange({
      referrers: [
        referrer({
          commissionPlan: {
            clock: "paidInvoices",
            phases: [
              {
                durationMonths: 1,
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 50 }],
              },
              {
                durationMonths: null,
                rateType: "FIXED",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 75 }],
              },
            ],
          },
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: {
        u1: [
          { amount: 500, paidAt: new Date(Date.UTC(2026, 4, 5)) },
          { amount: 500, paidAt: new Date(Date.UTC(2026, 4, 25)) },
        ],
      },
    })

    await computeMonthlyCommissions(PERIOD)

    // 50% de 500 (1a fatura) + R$75 fixo (2a fatura) = 325.
    // Lendo o 75 como percentual sairia 250 + 375 = 625.
    expect(Number(created().amount)).toBe(325)
  })

  it("unidade ativa cuja unica fatura ja foi comissionada nao gera valor fixo", async () => {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: [{ upTo: null, value: 75 }],
          commissionRateType: "FIXED",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "PAID_THIS_MONTH",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: { amount: 239, jaComissionada: true } },
    })

    await computeMonthlyCommissions(PERIOD)

    // Nada a apurar: a mensalidade ja foi paga pelo ledger legado.
    expectNothingWritten()
  })
})

describe("janela promocional: borda de fuso (o prazo e a data BRASILEIRA)", () => {
  /** Fim do dia 15/12/2026 em horario de Brasilia, como planToJson grava. */
  const ATE_15_12_BRT = "2026-12-15T23:59:59.999-03:00"

  function comJanela(paidAt: Date) {
    arrange({
      referrers: [
        referrer({
          commissionPlan: {
            clock: "paidInvoices",
            promoPaidUntil: ATE_15_12_BRT,
            phases: [
              {
                durationMonths: 1,
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 50 }],
              },
              {
                durationMonths: null,
                rateType: "PERCENT",
                bracketBasis: "ACTIVE_UNITS",
                payoutBase: "PAID_THIS_MONTH",
                brackets: [{ upTo: null, value: 10 }],
              },
            ],
          },
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: { amount: 239, paidAt } },
    })
  }

  it("pagamento as 22h de 15/12 (BRT) ainda esta DENTRO da promocao", async () => {
    // 22:00 BRT = 16/12 01:00 UTC. Gravando a janela em UTC (T23:59:59.999Z)
    // esta fatura cairia fora e pagaria R$23,90 dentro do prazo contratual.
    comJanela(new Date("2026-12-16T01:00:00.000Z"))

    await computeMonthlyCommissions("2026-12")

    expect(Number(created().amount)).toBe(119.5)
  })

  it("pagamento as 00:30 de 16/12 (BRT) esta FORA", async () => {
    comJanela(new Date("2026-12-16T03:30:00.000Z"))

    await computeMonthlyCommissions("2026-12")

    expect(Number(created().amount)).toBe(23.9)
  })
})

// ---------------------------------------------------------------------------
// FIXED + PAID_THIS_MONTH — configuracao ainda selecionavel no construtor de
// regras, mas que ficou sem cobertura quando a suite da CDA migrou para
// ALL_ACTIVE. Sao invariantes proprios deste payoutBase: o valor fixo e por
// UNIDADE (nao por fatura) e so entra quem pagou na competencia.
// ---------------------------------------------------------------------------

describe("FIXED + PAID_THIS_MONTH — valor por unidade que pagou", () => {
  function fixo(units: UnitRow[], paid: Scenario["paid"], activeTotal = units.length) {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: [{ upTo: null, value: 75 }],
          commissionRateType: "FIXED",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "PAID_THIS_MONTH",
        }),
      ],
      units,
      paid,
      activeTotal,
    })
  }

  it("unidade que pagou DUAS mensalidades no mes vale DUAS faixas", async () => {
    // Este caso afirmava o contrario ("conta UMA vez, o valor e por unidade")
    // ate 09/09/2026. A inversao e deliberada: com a competencia sendo
    // `max(vencimento, pagamento)`, a mensalidade que atrasou cai no mes
    // seguinte junto com a corrente — sao duas receitas, e um teto sobre a soma
    // apagaria a atrasada para sempre.
    //
    // `unitCount` continua 1: e a contagem de UNIDADES na base, nao de faixas.
    fixo([unit("u1")], { u1: [{ amount: 239 }, { amount: 239 }] })

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.unitCount).toBe(1)
    expect(Number(data.amount)).toBe(150)
  })

  it("unidade ativa porem inadimplente no mes NAO entra", async () => {
    fixo([unit("u1"), unit("u2")], { u1: 239 }, 2)

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1"])
    expect(Number(data.amount)).toBe(75)
  })
})

// ---------------------------------------------------------------------------
// Mes da indicacao: a faixa (`newThisMonthCount`) e o portao por unidade
// (`REFERRED_THIS_MONTH`) precisam concordar sobre a que mes uma indicada
// pertence. Ancora = COALESCE(activatedAt, createdAt).
// ---------------------------------------------------------------------------

describe("mes da indicacao — ancora unica COALESCE(activatedAt, createdAt)", () => {
  function comPayoutBase(units: UnitRow[]) {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: [{ upTo: null, value: 50 }],
          commissionRateType: "PERCENT",
          commissionBracketBasis: "ACTIVE_UNITS",
          commissionPayoutBase: "REFERRED_THIS_MONTH",
        }),
      ],
      units,
      activeTotal: units.length,
      paid: Object.fromEntries(units.map((u) => [u.id, 239])),
    })
  }

  it("cadastrada no mes ANTERIOR e ATIVADA na competencia conta como do mes", async () => {
    // O caso que fazia as duas metades da regra discordarem: a faixa ja contava
    // por ativacao, mas o portao por unidade olhava `createdAt` e a excluia.
    comPayoutBase([
      unit("ativadaAgora", {
        createdAt: new Date(Date.UTC(2026, 3, 28)), // 28/04
        activatedAt: new Date(Date.UTC(2026, 4, 2)), // 02/05 (competencia)
      }),
    ])

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["ativadaAgora"])
  })

  it("cadastrada na competencia mas ATIVADA depois NAO conta como do mes", async () => {
    comPayoutBase([
      unit("ativadaDepois", {
        createdAt: new Date(Date.UTC(2026, 4, 28)), // 28/05 (competencia)
        activatedAt: new Date(Date.UTC(2026, 5, 3)), // 03/06
      }),
    ])

    await computeMonthlyCommissions(PERIOD)

    expect(db.referralMonthlyCommission.create).not.toHaveBeenCalled()
  })

  it("sem activatedAt cai em createdAt (ativacao por cartao nao grava o campo)", async () => {
    comPayoutBase([
      unit("semAncora", {
        createdAt: new Date(Date.UTC(2026, 4, 10)), // 10/05 (competencia)
        activatedAt: null,
      }),
    ])

    await computeMonthlyCommissions(PERIOD)

    const data = created()
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["semAncora"])
  })
})

describe("unidade que nunca pagou nao entra em conta nenhuma", () => {
  /**
   * Decisao do dono (09/09/2026), a partir de um caso real: `desenvolve
   * tamarana` estava ACTIVE com plano de R$ 239, `activatedAt` nulo e a unica
   * cobranca DELETED — nunca entrou um centavo. Mesmo assim contava como
   * ativacao do mes (subindo a faixa) e valia R$ 75 na base do indicador.
   *
   * O mock do Prisma devolve linhas prontas e NAO avalia o `where`, entao o que
   * se testa aqui e a INVARIANTE que de fato protege a regra: o predicado tem
   * de estar nas TRES consultas de universo/contagem. Aplicar so no universo
   * (ou so numa contagem) e o defeito classico deste motor — duas metades da
   * mesma regra discordando sobre quem e uma indicada valida, como ja aconteceu
   * com `createdAt` x `activatedAt`.
   */
  it("o predicado 'ja pagou' vai nas TRES consultas (2 contagens + universo)", async () => {
    arrange({
      referrers: [referrer({ commissionBrackets: flatBracket(50) })],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    // As consultas do motor por indicador sao as que filtram por
    // `referrerTenantId` — descarta a busca inicial dos indicadores.
    const wheres = [
      ...db.tenant.count.mock.calls,
      ...db.tenant.findMany.mock.calls,
    ]
      .map((call) => call[0]?.where as Record<string, unknown> | undefined)
      .filter((where) => where && "referrerTenantId" in where)

    expect(wheres).toHaveLength(3)
    for (const where of wheres) {
      expect(where).toMatchObject({
        tenantPayments: { some: expect.anything() },
      })
    }
  })

  it("o predicado e o do lifecycle, nao uma copia local", async () => {
    // Reescrever a regra aqui faria o motor divergir do churn/blacklist. O
    // `paidAt`/`markedPaidAt` no OR nao e decorativo: status de cobranca e
    // MUTAVEL (estorno reescreve a linha que era RECEIVED) e sem eles uma
    // unidade que pagou de verdade voltaria a ler como "nunca pagou".
    arrange({
      referrers: [referrer({ commissionBrackets: flatBracket(50) })],
      units: [unit("u1")],
      activeTotal: 1,
      paid: { u1: 239 },
    })

    await computeMonthlyCommissions(PERIOD)

    const universo = db.tenant.findMany.mock.calls
      .map((call) => call[0]?.where as Record<string, unknown> | undefined)
      .find((where) => where && "referrerTenantId" in where)

    expect(universo?.tenantPayments).toEqual(
      EVER_PAID_TENANT_WHERE.tenantPayments,
    )
  })
})

describe("competencia: a fatura antecipada fica no mes dela", () => {
  /**
   * A regra vive em src/lib/asaas/competencia.ts e chega ao motor pela coluna
   * `TenantPayment.competenceAt` = max(vencimento, pagamento do cliente).
   *
   * Estes casos travam a METADE que e do motor: que ele consulta a COMPETENCIA
   * e nao a data de caixa. Enquanto ele filtrava por `paidAt`, uma unidade que
   * antecipou a fatura de maio pagando em abril sumia de maio, e uma que pagou
   * no cartao entrava um mes depois (o Asaas credita em D+32).
   */
  function comFatura(paid: Record<string, PaidEntry>) {
    arrange({
      referrers: [
        referrer({
          commissionBrackets: flatBracket(75),
          commissionRateType: "FIXED",
          commissionPayoutBase: "ALL_ACTIVE",
        }),
      ],
      units: [unit("u1")],
      activeTotal: 1,
      paid,
    })
  }

  it("pagou em ABRIL a fatura de MAIO: entra na competencia de MAIO", async () => {
    comFatura({
      u1: {
        amount: 239,
        paidAt: new Date(Date.UTC(2026, 3, 28)), // 28/04, antecipado
        competenceAt: new Date(Date.UTC(2026, 4, 2)), // fatura vence 02/05
      },
    })

    await computeMonthlyCommissions(PERIOD) // 2026-05

    const data = created()
    expect(Number(data.amount)).toBe(75)
    expect(data.linesSnapshot.map((l) => l.tenantId)).toEqual(["u1"])
  })

  it("pagou em JUNHO a fatura de MAIO: NAO entra em maio", async () => {
    comFatura({
      u1: {
        amount: 239,
        paidAt: new Date(Date.UTC(2026, 5, 3)), // 03/06, atrasado
        competenceAt: new Date(Date.UTC(2026, 5, 3)), // atraso move a competencia
      },
    })

    await computeMonthlyCommissions(PERIOD)

    // Sem fatura na competencia, o FIXED proporcional zera e a linha some.
    expect(db.referralMonthlyCommission.create).not.toHaveBeenCalled()
  })

  it("cartao creditado no mes seguinte continua na competencia do cliente", async () => {
    // Cliente pagou 20/05 a fatura de 20/05; o Asaas so creditou em 21/06.
    // Enquanto o motor lia a data de credito, esta unidade caia em junho.
    comFatura({
      u1: {
        amount: 239,
        paidAt: new Date(Date.UTC(2026, 5, 21)), // credito D+32
        competenceAt: new Date(Date.UTC(2026, 4, 20)),
      },
    })

    await computeMonthlyCommissions(PERIOD)

    expect(Number(created().amount)).toBe(75)
  })
})
