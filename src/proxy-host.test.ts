import { describe, it, expect } from "vitest"
import { classifyHost, matchApex, stripPort, isApexPassthrough } from "./proxy"

// QA-016: classificação de host do proxy multi-tenant. Funções puras que
// decidem se um host é PMB institucional, vitrine apex, subdomínio reservado
// (nunca tenant) ou vitrine de revendedor {slug}. Uma regressão aqui é porta de
// entrada para vazamento cross-tenant. Usa os domínios primários (sempre
// presentes independente de env): profissionalizamaisbrasil.com.br / livrecursos.com.br.

describe("stripPort", () => {
  it("remove a porta do hostname", () => {
    expect(stripPort("loja1.livrecursos.com.br:3000")).toBe("loja1.livrecursos.com.br")
  })
  it("hostname sem porta fica inalterado", () => {
    expect(stripPort("livrecursos.com.br")).toBe("livrecursos.com.br")
  })
})

describe("classifyHost — domínio PMB (app)", () => {
  it("apex PMB → app", () => {
    expect(classifyHost("profissionalizamaisbrasil.com.br")).toMatchObject({
      kind: "app",
      subdomain: null,
    })
  })
  it("www PMB → app", () => {
    expect(classifyHost("www.profissionalizamaisbrasil.com.br")).toMatchObject({ kind: "app" })
  })
  it("qualquer subdomínio de PMB é app (nunca tenant) — isola admin/painel", () => {
    // Subdomínios no domínio institucional NUNCA viram tenant.
    expect(classifyHost("qualquercoisa.profissionalizamaisbrasil.com.br")).toMatchObject({
      kind: "app",
      subdomain: "qualquercoisa",
    })
  })
})

describe("classifyHost — domínio de vitrine (livrecursos)", () => {
  it("apex livrecursos → vitrine_apex (landing de captação)", () => {
    expect(classifyHost("livrecursos.com.br")).toMatchObject({ kind: "vitrine_apex" })
  })
  it("www livrecursos → vitrine_apex", () => {
    expect(classifyHost("www.livrecursos.com.br")).toMatchObject({ kind: "vitrine_apex" })
  })
  it("{slug}.livrecursos.com.br → tenant com o slug correto", () => {
    expect(classifyHost("polobetim.livrecursos.com.br")).toMatchObject({
      kind: "tenant",
      subdomain: "polobetim",
    })
  })
  it("host de vitrine com porta explícita cai em unknown (comportamento atual — prod não envia porta)", () => {
    // O matching do apex de vitrine NÃO faz stripPort no hostname inteiro (só no
    // slice do subdomínio e no ramo localhost). Em produção o header Host nunca
    // carrega porta, então este caminho é inalcançável; documentamos o atual.
    expect(classifyHost("polobetim.livrecursos.com.br:3000")).toMatchObject({ kind: "unknown" })
  })

  it.each(["www", "app", "api", "admin", "painel", "mail", "cdn", "static", "staging", "dev", "test"])(
    "subdomínio reservado %s é vitrine_apex, NUNCA tenant",
    (reserved) => {
      const info = classifyHost(`${reserved}.livrecursos.com.br`)
      expect(info.kind).toBe("vitrine_apex")
      expect(info.kind).not.toBe("tenant")
    },
  )
})

describe("classifyHost — dev local e domínio custom", () => {
  it("localhost → app", () => {
    expect(classifyHost("localhost")).toMatchObject({ kind: "app" })
  })
  it("{slug}.localhost → tenant (conveniência dev)", () => {
    expect(classifyHost("loja1.localhost")).toMatchObject({ kind: "tenant", subdomain: "loja1" })
  })
  it("{slug}.localhost:3000 → tenant (o ramo localhost aplica stripPort ao host)", () => {
    expect(classifyHost("loja1.localhost:3000")).toMatchObject({ kind: "tenant", subdomain: "loja1" })
  })
  it("domínio custom desconhecido → unknown (cai no lookup por customDomain no DB)", () => {
    expect(classifyHost("escola-do-joao.com.br")).toMatchObject({
      kind: "unknown",
      apex: null,
      subdomain: null,
    })
  })
})

describe("matchApex", () => {
  it("apex exato → app sem subdomínio", () => {
    expect(matchApex("exemplo.com", "exemplo.com")).toMatchObject({ kind: "app", subdomain: null })
  })
  it("subdomínio do apex → app com subdomínio", () => {
    expect(matchApex("sub.exemplo.com", "exemplo.com")).toMatchObject({
      kind: "app",
      subdomain: "sub",
    })
  })
  it("host de outro apex → null", () => {
    expect(matchApex("outro.com", "exemplo.com")).toBeNull()
  })
})

describe("isApexPassthrough", () => {
  it("rotas de captação/validação/api passam direto no apex da vitrine", () => {
    expect(isApexPassthrough("/seja-revendedor")).toBe(true)
    expect(isApexPassthrough("/seja-revendedor/checkout")).toBe(true)
    expect(isApexPassthrough("/validar/ABC123")).toBe(true)
    expect(isApexPassthrough("/api/leads")).toBe(true)
  })
  it("rota comum não passa direto (será reescrita para /livrecursos)", () => {
    expect(isApexPassthrough("/")).toBe(false)
    expect(isApexPassthrough("/sobre")).toBe(false)
    // Não casa por prefixo parcial de palavra.
    expect(isApexPassthrough("/validarcoisa")).toBe(false)
  })
})
