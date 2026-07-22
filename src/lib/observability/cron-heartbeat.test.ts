import { describe, it, expect, vi, beforeEach } from "vitest"

// O batimento existe porque `cron.job_run_details` prova que o Postgres
// disparou, nao que a rota rodou — foi essa lacuna que deixou TODOS os jobs
// parados por seis semanas em 2026 sem ninguem perceber. O que precisa ser
// provado aqui: (a) o nome do job sai da URL, para job novo ser monitorado sem
// cadastro manual; (b) requisicao NAO autorizada nao falseia saude; (c) falha
// do proprio batimento nao derruba o job; (d) o atraso respeita a cadencia.

vi.mock("@/lib/prisma", () => ({
  prisma: { cronRun: { upsert: vi.fn(), findMany: vi.fn() } },
}))
vi.mock("@/lib/auth/bearer", () => ({ isCronAuthorized: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}))

import { prisma } from "@/lib/prisma"
import { isCronAuthorized } from "@/lib/auth/bearer"
import {
  cronJobNameFromRequest,
  recordCronRun,
  authorizeCron,
  getCronHealth,
} from "./cron-heartbeat"

const p = prisma as unknown as {
  cronRun: {
    upsert: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
}
const authMock = isCronAuthorized as unknown as ReturnType<typeof vi.fn>

function req(url: string): Request {
  return new Request(url)
}

beforeEach(() => {
  vi.clearAllMocks()
  p.cronRun.upsert.mockResolvedValue({})
  p.cronRun.findMany.mockResolvedValue([])
  authMock.mockReturnValue(true)
})

describe("cronJobNameFromRequest", () => {
  it("extrai o nome do job da rota", () => {
    expect(
      cronJobNameFromRequest(req("https://x.com/api/cron/sync-progresso")),
    ).toBe("sync-progresso")
    expect(
      cronJobNameFromRequest(req("https://x.com/api/cron/sweep-boleto-installments?dry=1")),
    ).toBe("sweep-boleto-installments")
  })

  it("devolve null fora do namespace de cron", () => {
    expect(cronJobNameFromRequest(req("https://x.com/api/admin/dashboard"))).toBeNull()
  })
})

describe("authorizeCron", () => {
  it("autoriza e registra o batimento", async () => {
    expect(await authorizeCron(req("https://x.com/api/cron/sync-cursos"))).toBe(true)
    expect(p.cronRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobName: "sync-cursos" } }),
    )
  })

  it("NAO registra batimento de chamada nao autorizada", async () => {
    // Senao qualquer um poderia bater na rota e mascarar um cron parado.
    authMock.mockReturnValue(false)

    expect(await authorizeCron(req("https://x.com/api/cron/sync-cursos"))).toBe(false)
    expect(p.cronRun.upsert).not.toHaveBeenCalled()
  })

  it("falha do batimento nao derruba o job", async () => {
    // Um monitor que derruba o que monitora e pior que monitor nenhum.
    p.cronRun.upsert.mockRejectedValue(new Error("banco fora"))

    await expect(
      authorizeCron(req("https://x.com/api/cron/sync-cursos")),
    ).resolves.toBe(true)
  })

  it("nem mesmo um log quebrado derruba o job", async () => {
    // Um `catch` que lanca anula a garantia inteira: a excecao subiria por
    // authorizeCron e o cron morreria com 401/500. Regressao real, pega quando
    // duas suites de cron quebraram por um mock de logger sem `warn`.
    p.cronRun.upsert.mockRejectedValue(new Error("banco fora"))
    const { contextLogger } = await import("@/lib/logger")
    vi.mocked(contextLogger).mockReturnValueOnce(
      {} as unknown as ReturnType<typeof contextLogger>,
    )

    await expect(
      authorizeCron(req("https://x.com/api/cron/sync-cursos")),
    ).resolves.toBe(true)
  })
})

describe("recordCronRun", () => {
  it("incrementa a contagem em vez de sobrescrever", async () => {
    await recordCronRun("sync-progresso")

    expect(p.cronRun.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ runCount: { increment: 1 } }),
      }),
    )
  })
})

describe("getCronHealth", () => {
  const now = new Date("2026-07-22T12:00:00Z")

  it("marca ATRASADO o job diario parado ha mais de um dia", async () => {
    p.cronRun.findMany.mockResolvedValue([
      { jobName: "sync-progresso", lastRunAt: new Date("2026-07-20T07:00:00Z"), runCount: 40 },
    ])

    const [job] = await getCronHealth(now)
    expect(job.overdue).toBe(true)
    expect(job.hoursSinceLastRun).toBe(53)
  })

  it("nao acusa atraso de job diario que rodou hoje", async () => {
    p.cronRun.findMany.mockResolvedValue([
      { jobName: "sync-progresso", lastRunAt: new Date("2026-07-22T07:00:00Z"), runCount: 41 },
    ])

    expect((await getCronHealth(now))[0].overdue).toBe(false)
  })

  it("respeita a cadencia propria de cada job", async () => {
    // 4h parado: irrelevante para um job diario, ATRASO para um horario.
    const lastRunAt = new Date("2026-07-22T08:00:00Z")
    p.cronRun.findMany.mockResolvedValue([
      { jobName: "reactivate-paid", lastRunAt, runCount: 9 },
      { jobName: "sync-cursos", lastRunAt, runCount: 9 },
    ])

    const health = await getCronHealth(now)
    expect(health.find((j) => j.jobName === "reactivate-paid")?.overdue).toBe(true)
    expect(health.find((j) => j.jobName === "sync-cursos")?.overdue).toBe(false)
  })

  it("nao acusa atraso do mensal recem-rodado", async () => {
    p.cronRun.findMany.mockResolvedValue([
      { jobName: "referral-monthly-payout", lastRunAt: new Date("2026-07-20T05:00:00Z"), runCount: 3 },
    ])

    expect((await getCronHealth(now))[0].overdue).toBe(false)
  })
})
