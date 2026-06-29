import { describe, expect, it } from "vitest"

import { normalizeLmsPublicUrl } from "./urls"

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test"
process.env.LMS_API_URL = ""

describe("normalizeLmsPublicUrl", () => {
  it("troca 0.0.0.0 pelo domínio público do LMS preservando path e query", () => {
    expect(
      normalizeLmsPublicUrl("http://0.0.0.0:3000/sso/consume?token=abc#player"),
    ).toBe("https://lms.bmbr.com.br/sso/consume?token=abc#player")
  })

  it("normaliza URLs relativas para o domínio público do LMS", () => {
    expect(normalizeLmsPublicUrl("/login?course=abc")).toBe(
      "https://lms.bmbr.com.br/login?course=abc",
    )
  })

  it("mantém URLs públicas externas válidas", () => {
    expect(normalizeLmsPublicUrl("https://parceiro.example.com/login")).toBe(
      "https://parceiro.example.com/login",
    )
  })
})
