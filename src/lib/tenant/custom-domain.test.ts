import { describe, it, expect } from "vitest"
import {
  customDomainKind,
  customDomainVariants,
  customDomainDnsRecords,
} from "./custom-domain"

describe("dominio proprio: raiz x subdominio", () => {
  it("classifica pela lista de sufixos publicos, nao por contagem de pontos", () => {
    expect(customDomainKind("msoluti.shop")).toBe("apex")
    expect(customDomainKind("ciaeb.com.br")).toBe("apex")
    expect(customDomainKind("www.ciaeb.com.br")).toBe("apex")
    expect(customDomainKind("ead.msoluti.shop")).toBe("subdomain")
    expect(customDomainKind("cursos.ciaeb.com.br")).toBe("subdomain")
  })

  it("raiz anexa apex + www; subdominio so ele mesmo", () => {
    expect(customDomainVariants("ciaeb.com.br")).toEqual([
      "ciaeb.com.br",
      "www.ciaeb.com.br",
    ])
    expect(customDomainVariants("ead.msoluti.shop")).toEqual(["ead.msoluti.shop"])
  })

  it("subdominio recebe um CNAME no proprio prefixo, nunca o registro do @", () => {
    const records = customDomainDnsRecords("ead.msoluti.shop")
    expect(records).toEqual([
      { type: "CNAME", name: "ead", value: expect.stringMatching(/^cname\./) },
    ])
    expect(customDomainDnsRecords("cursos.ciaeb.com.br")[0].name).toBe("cursos")
  })

  it("raiz recebe A no @ + CNAME no www", () => {
    const records = customDomainDnsRecords("msoluti.shop")
    expect(records.map((r) => [r.type, r.name])).toEqual([
      ["A", "@"],
      ["CNAME", "www"],
    ])
  })
})
