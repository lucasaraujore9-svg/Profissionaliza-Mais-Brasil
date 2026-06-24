import { describe, expect, it, vi, beforeEach } from "vitest"

// swallow() é o contrato de que side-effects fire-and-forget LOGAM ao falhar
// (em vez de `.catch(() => {})` silencioso). COD-006 passou a usá-lo em fluxos
// financeiros (comissão/payout/automação) — este teste trava esse contrato.
const { warn } = vi.hoisted(() => ({ warn: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  contextLogger: () => ({ warn }),
}))

import { swallow } from "./errors"

describe("swallow", () => {
  beforeEach(() => warn.mockClear())

  it("loga warn com o contexto e o erro, e retorna undefined", () => {
    const err = new Error("boom")
    const result = swallow("ctx.test")(err)
    expect(result).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(
      { err, swallowed: "ctx.test" },
      "swallowed error",
    )
  })

  it("nunca lança, mesmo com valor não-Error (null/string)", () => {
    expect(() => swallow("x")("falha em string")).not.toThrow()
    expect(swallow("x")(null)).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
  })
})
