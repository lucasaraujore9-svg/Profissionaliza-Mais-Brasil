import { describe, it, expect } from "vitest"
import { adminCtx } from "@/test/admin-ctx"
import { NUNCA_ATIVOU_FILTER } from "@/lib/tenants/lifecycle"
import { parseResellerListFilters, resellerListWhere } from "./list-query"

/*
 * O `where` da lista de unidades — e, pela mesma função, o do export XLSX.
 *
 * O risco aqui não é a busca por nome: é o RECORTE DE CARTEIRA sumir. A lista
 * mostra 12 unidades para um gerente; se o export re-derivasse o filtro por
 * conta própria (ou se um filtro de status sobrescrevesse o recorte), a mesma
 * pessoa baixaria a base inteira da rede num clique. Por isso a única coisa que
 * estes testes protegem de verdade é: o escopo do papel está SEMPRE no `AND`,
 * em qualquer combinação de filtros.
 */

function filters(over: Partial<ReturnType<typeof parseResellerListFilters>> = {}) {
  return { q: "", status: "", manager: "", ...over }
}

/** Cláusulas do `where` composto — o escopo é a primeira. */
function clauses(query: Awaited<ReturnType<typeof resellerListWhere>>) {
  return (query!.where as { AND: Record<string, unknown>[] }).AND
}

describe("where da lista de revendedores", () => {
  it("quem não alcança unidade nenhuma recebe null (e não um where vazio)", async () => {
    const ctx = adminCtx({ role: "PMB_DESIGNER" })
    expect(await resellerListWhere(ctx, filters())).toBeNull()
  })

  it("quem vê a rede inteira não ganha filtro de dono", async () => {
    const query = await resellerListWhere(adminCtx({ role: "SUPER_ADMIN" }), filters())
    expect(clauses(query)[0]).toEqual({})
  })

  it("quem tem carteira carrega o recorte do papel", async () => {
    const ctx = adminCtx({ role: "PMB_RESELLER_MGR", userId: "u9" })
    const query = await resellerListWhere(ctx, filters())
    expect(clauses(query)[0]).toEqual({ accountManagerId: "u9" })
  })

  it("filtro de status NÃO apaga o recorte de carteira", async () => {
    const ctx = adminCtx({ role: "PMB_RESELLER_MGR", userId: "u9" })
    const query = await resellerListWhere(ctx, filters({ status: "ACTIVE" }))
    const and = clauses(query)
    expect(and).toContainEqual({ accountManagerId: "u9" })
    expect(and).toContainEqual({ status: "ACTIVE" })
  })

  it('o balde "Nunca ativou" traz status próprio E preserva o recorte', async () => {
    const ctx = adminCtx({ role: "PMB_RESELLER_MGR", userId: "u9" })
    const query = await resellerListWhere(
      ctx,
      filters({ status: NUNCA_ATIVOU_FILTER }),
    )
    const and = clauses(query)
    expect(and).toContainEqual({ accountManagerId: "u9" })
    // O predicado de "nunca pagou" entra como cláusula separada — se viesse por
    // spread, ele e o recorte se sobrescreveriam conforme a ordem.
    expect(and.some((c) => "status" in c && "tenantPayments" in c)).toBe(true)
  })

  it("busca procura na unidade e no titular sem tocar no recorte", async () => {
    const ctx = adminCtx({ role: "PMB_RESELLER_MGR", userId: "u9" })
    const query = await resellerListWhere(ctx, filters({ q: "joao" }))
    const and = clauses(query)
    expect(and).toContainEqual({ accountManagerId: "u9" })
    const busca = and.find((c) => "OR" in c) as { OR: unknown[] }
    expect(busca.OR).toHaveLength(4)
  })

  it("filtro por gerente só vale para quem vê a rede inteira", async () => {
    const carteira = await resellerListWhere(
      adminCtx({ role: "PMB_RESELLER_MGR", userId: "u9" }),
      filters({ manager: "outro" }),
    )
    expect(clauses(carteira).some((c) => c.accountManagerId === "outro")).toBe(false)

    const superAdmin = await resellerListWhere(
      adminCtx({ role: "SUPER_ADMIN" }),
      filters({ manager: "outro" }),
    )
    expect(clauses(superAdmin)).toContainEqual({ accountManagerId: "outro" })
  })

  it('"unassigned" vira gerente nulo, não a string', async () => {
    const query = await resellerListWhere(
      adminCtx({ role: "SUPER_ADMIN" }),
      filters({ manager: "unassigned" }),
    )
    expect(clauses(query)).toContainEqual({ accountManagerId: null })
  })

  it("status inventado é ignorado em vez de virar filtro", async () => {
    const query = await resellerListWhere(
      adminCtx({ role: "SUPER_ADMIN" }),
      filters({ status: "QUALQUERCOISA" }),
    )
    expect(clauses(query).some((c) => "status" in c)).toBe(false)
  })

  it("lê os filtros da query string normalizando o status", () => {
    const parsed = parseResellerListFilters(
      new URLSearchParams("q=%20joao%20&status=active&manager=u1"),
    )
    expect(parsed).toEqual({ q: "joao", status: "ACTIVE", manager: "u1" })
  })
})
