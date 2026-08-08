import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * `loadTenantLifecycle` é o ÚNICO ponto onde o predicado de "já pagou" é
 * avaliado no caminho de escrita — todo gate de cortesia depende dele.
 *
 * Ele não tinha teste nenhum: os testes de rota mockam `prisma.tenant.findUnique`
 * inteiro e devolvem um `tenantPayments` hard-coded, então nunca observam a
 * consulta que o Prisma realmente faria. Verificado por mutação na revisão:
 * remover o `where: EVER_PAID_PAYMENT_WHERE` do select aninhado mantinha os
 * 1646 testes verdes — e o gate passaria a considerar QUALQUER cobrança
 * (inclusive PENDING e OVERDUE) como pagamento, liberando a trava para todo
 * mundo.
 *
 * Aqui o mock é o Prisma cru: o teste inspeciona os ARGUMENTOS da consulta.
 */

const db = vi.hoisted(() => ({ tenant: { findUnique: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

import { loadTenantLifecycle, EVER_PAID_PAYMENT_WHERE } from "./lifecycle"

const BASE = {
  id: "t1",
  slug: "unidade",
  status: "SUSPENDED" as const,
  accountManagerId: null,
  salesUserId: null,
  createdAt: new Date("2026-06-01T12:00:00Z"),
}

beforeEach(() => vi.clearAllMocks())

describe("loadTenantLifecycle — forma da consulta", () => {
  it("filtra as cobranças pelo predicado de pagamento", async () => {
    db.tenant.findUnique.mockResolvedValue({ ...BASE, tenantPayments: [] })

    await loadTenantLifecycle("t1")

    const args = db.tenant.findUnique.mock.calls[0][0]
    expect(args.where).toEqual({ id: "t1" })
    expect(args.select.tenantPayments.where).toEqual(EVER_PAID_PAYMENT_WHERE)
  })

  it("pede só uma linha — interessa se existe, não quantas", async () => {
    db.tenant.findUnique.mockResolvedValue({ ...BASE, tenantPayments: [] })

    await loadTenantLifecycle("t1")

    expect(db.tenant.findUnique.mock.calls[0][0].select.tenantPayments.take).toBe(1)
  })

  /** `createdAt` é a âncora do teto de vencimento; sem ele o gate não decide. */
  it("carrega createdAt e os campos de carteira no mesmo round-trip", async () => {
    db.tenant.findUnique.mockResolvedValue({ ...BASE, tenantPayments: [] })

    await loadTenantLifecycle("t1")

    const select = db.tenant.findUnique.mock.calls[0][0].select
    expect(select.createdAt).toBe(true)
    expect(select.accountManagerId).toBe(true)
    expect(select.salesUserId).toBe(true)
  })

  it("uma consulta só", async () => {
    db.tenant.findUnique.mockResolvedValue({ ...BASE, tenantPayments: [] })
    await loadTenantLifecycle("t1")
    expect(db.tenant.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe("loadTenantLifecycle — derivação", () => {
  it("sem cobrança paga e fora do ar: nunca ativou", async () => {
    db.tenant.findUnique.mockResolvedValue({ ...BASE, tenantPayments: [] })

    const lc = await loadTenantLifecycle("t1")

    expect(lc).toMatchObject({ everPaid: false, neverActivated: true })
  })

  it("com cobrança paga: já pagou, não é 'nunca ativou'", async () => {
    db.tenant.findUnique.mockResolvedValue({
      ...BASE,
      tenantPayments: [{ id: "p1" }],
    })

    const lc = await loadTenantLifecycle("t1")

    expect(lc).toMatchObject({ everPaid: true, neverActivated: false })
  })

  /**
   * PENDING nunca é "nunca ativou" (o balde do relatório é de quem está FORA do
   * ar) — mas `everPaid: false` é o que faz os gatilhos de cortesia dispararem
   * nela, que é o furo que a revisão pegou.
   */
  it("PENDING sem pagamento: everPaid false, mas não entra no balde", async () => {
    db.tenant.findUnique.mockResolvedValue({
      ...BASE,
      status: "PENDING",
      tenantPayments: [],
    })

    const lc = await loadTenantLifecycle("t1")

    expect(lc).toMatchObject({ everPaid: false, neverActivated: false })
  })

  it("ACTIVE sem pagamento (cortesia): everPaid false, fora do balde", async () => {
    db.tenant.findUnique.mockResolvedValue({
      ...BASE,
      status: "ACTIVE",
      tenantPayments: [],
    })

    const lc = await loadTenantLifecycle("t1")

    expect(lc).toMatchObject({ everPaid: false, neverActivated: false })
  })

  it("CANCELLED sem pagamento entra no balde", async () => {
    db.tenant.findUnique.mockResolvedValue({
      ...BASE,
      status: "CANCELLED",
      tenantPayments: [],
    })

    expect(await loadTenantLifecycle("t1")).toMatchObject({ neverActivated: true })
  })

  it("devolve null quando a unidade não existe", async () => {
    db.tenant.findUnique.mockResolvedValue(null)
    expect(await loadTenantLifecycle("sumiu")).toBeNull()
  })
})
