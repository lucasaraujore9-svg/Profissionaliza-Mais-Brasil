import { describe, it, expect, vi, beforeEach } from "vitest"

/*
 * A trava de cortesia é por TENANT. Sem uma trava por PESSOA, cancelar a
 * unidade que nunca pagou e abrir outra de graça para o MESMO dono contornava a
 * regra inteira — o titular é a pessoa, não a linha do banco.
 *
 * Três identificadores porque cada um sozinho é fraco: e-mail é trivial de
 * trocar, telefone não tem unicidade no banco (e foi gravado como a pessoa
 * digitou), e CPF é o mais difícil de trocar mas pode faltar em conta antiga.
 */

const db = vi.hoisted(() => ({ tenant: { findMany: vi.fn() } }))
vi.mock("@/lib/prisma", () => ({ prisma: db }))

import {
  findBlockedUnitsForPerson,
  assertCortesiaNaCriacao,
  NEVER_ACTIVATED_WHERE,
  MIN_REASON_LENGTH,
} from "./lifecycle"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"

function unidadeTravada(owner: {
  cpf?: string | null
  email?: string
  phone?: string | null
}) {
  return {
    id: "t-velho",
    slug: "unidade-velha",
    name: "Unidade Velha",
    status: "CANCELLED" as const,
    owner: { cpf: null, email: "dono@x.com", phone: null, ...owner },
  }
}

beforeEach(() => vi.clearAllMocks())

describe("findBlockedUnitsForPerson — consulta", () => {
  it("procura só entre as unidades travadas, sem o placeholder PMB", async () => {
    db.tenant.findMany.mockResolvedValue([])

    await findBlockedUnitsForPerson({ email: "dono@x.com" })

    const where = db.tenant.findMany.mock.calls[0][0].where
    expect(where.status).toEqual(NEVER_ACTIVATED_WHERE.status)
    expect(where.tenantPayments).toEqual(NEVER_ACTIVATED_WHERE.tenantPayments)
    expect(where.slug).toEqual({ not: PMB_TENANT_SLUG })
  })

  it("não consulta o banco quando não há identificador nenhum", async () => {
    const r = await findBlockedUnitsForPerson({})
    expect(r).toEqual([])
    expect(db.tenant.findMany).not.toHaveBeenCalled()
  })
})

describe("findBlockedUnitsForPerson — casamento por identificador", () => {
  it("casa por CPF ignorando máscara", async () => {
    db.tenant.findMany.mockResolvedValue([unidadeTravada({ cpf: "12345678901" })])

    const r = await findBlockedUnitsForPerson({ cpfCnpj: "123.456.789-01" })

    expect(r).toHaveLength(1)
    expect(r[0].slug).toBe("unidade-velha")
  })

  it("casa por e-mail ignorando caixa e espaços", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidadeTravada({ email: "Dono@X.com" }),
    ])

    expect(await findBlockedUnitsForPerson({ email: "  dono@x.com " })).toHaveLength(1)
  })

  /**
   * `User.phone` não tem unicidade e foi gravado como a pessoa digitou:
   * "(31) 99999-8888" e "+5531999998888" são a mesma pessoa e nenhum
   * `equals`/`contains` no banco os aproxima. Por isso o casamento é em memória.
   */
  it("casa por telefone normalizando formato e DDI", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidadeTravada({ phone: "(31) 99999-8888" }),
    ])

    expect(await findBlockedUnitsForPerson({ phone: "+5531999998888" })).toHaveLength(1)
  })

  it("não casa pessoa diferente", async () => {
    db.tenant.findMany.mockResolvedValue([
      unidadeTravada({ cpf: "12345678901", email: "outro@x.com", phone: "31988887777" }),
    ])

    const r = await findBlockedUnitsForPerson({
      cpfCnpj: "99999999999",
      email: "novo@x.com",
      phone: "31911112222",
    })

    expect(r).toEqual([])
  })

  it("ignora unidade travada sem titular", async () => {
    db.tenant.findMany.mockResolvedValue([
      { id: "t1", slug: "orfa", name: "Órfã", status: "CANCELLED", owner: null },
    ])

    expect(await findBlockedUnitsForPerson({ email: "dono@x.com" })).toEqual([])
  })

  it("devolve todas as travadas do mesmo titular", async () => {
    db.tenant.findMany.mockResolvedValue([
      { ...unidadeTravada({ email: "dono@x.com" }), id: "a", slug: "a" },
      { ...unidadeTravada({ email: "dono@x.com" }), id: "b", slug: "b" },
    ])

    expect(await findBlockedUnitsForPerson({ email: "dono@x.com" })).toHaveLength(2)
  })
})

describe("assertCortesiaNaCriacao", () => {
  const travada = [
    { id: "a", slug: "unidade-velha", name: "Unidade Velha", status: "CANCELLED" as const },
  ]

  it("libera quando o titular não tem unidade travada", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: [],
      trigger: "free",
      override: { allowed: false },
    })
    expect(v.blocked).toBe(false)
  })

  it("bloqueia cortesia para titular com unidade travada", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: travada,
      trigger: "free",
      override: { allowed: false },
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: false })
  })

  /** A mensagem tem que nomear a unidade, senão quem cadastra não entende o 403. */
  it("nomeia a unidade que causou o bloqueio", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: travada,
      trigger: "free",
      override: { allowed: false },
    })
    expect(v.blocked && v.message).toContain("unidade-velha")
    expect(v.blocked && v.message).toContain("cancelada")
  })

  /** Preço cheio passa: a pessoa volta como cliente de verdade. */
  it("avisa que a preço cheio pode cadastrar", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: travada,
      trigger: "promo",
      override: { allowed: false },
    })
    expect(v.blocked && v.message).toContain("preço cheio")
  })

  it("pede o motivo de quem tem a permissão", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: travada,
      trigger: "free",
      override: { allowed: true },
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("recusa motivo curto demais", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: travada,
      trigger: "free",
      override: { allowed: true, reason: "x".repeat(MIN_REASON_LENGTH - 1) },
    })
    expect(v).toMatchObject({ blocked: true, requiresReason: true })
  })

  it("libera com permissão e motivo, marcando o override", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: travada,
      trigger: "free",
      override: { allowed: true, reason: "acordo comercial fechado com o titular" },
    })
    expect(v).toMatchObject({
      blocked: false,
      overridden: true,
      reason: "acordo comercial fechado com o titular",
    })
  })

  it("plural quando há mais de uma unidade travada", () => {
    const v = assertCortesiaNaCriacao({
      blockedUnits: [...travada, { id: "b", slug: "outra", name: "Outra", status: "SUSPENDED" as const }],
      trigger: "free",
      override: { allowed: false },
    })
    expect(v.blocked && v.message).toContain("2 unidades")
    expect(v.blocked && v.message).toContain("suspensa")
  })
})
