import { describe, it, expect, vi } from "vitest"

vi.mock("next/headers", () => ({ cookies: vi.fn() }))
vi.mock("@/lib/env", () => ({ authSecret: () => "segredo-de-teste-32-bytes-ok!!" }))

import { decodePreview, encodePreview } from "./painel-preview"

describe("cookie da prévia 'ver como'", () => {
  it("round-trip preserva papel e dono", () => {
    const raw = encodePreview("finance", "owner-1")
    const parsed = decodePreview(raw)
    expect(parsed?.role).toBe("finance")
    expect(parsed?.ownerUserId).toBe("owner-1")
  })

  it("rejeita payload adulterado (assinatura inválida)", () => {
    const raw = encodePreview("consultant", "owner-1")
    const [payload, sig] = raw.split(".")
    // Troca o papel no payload mantendo a assinatura antiga.
    const forged = Buffer.from(
      JSON.stringify({ role: "manager", ownerUserId: "owner-1", startedAt: Date.now() }),
    ).toString("base64url")
    expect(decodePreview(`${forged}.${sig}`)).toBeNull()
    // O original continua válido — o teste não passou por acidente.
    expect(decodePreview(`${payload}.${sig}`)).not.toBeNull()
  })

  it("rejeita lixo, cookie vazio e formato inesperado", () => {
    expect(decodePreview(undefined)).toBeNull()
    expect(decodePreview("")).toBeNull()
    expect(decodePreview("sem-ponto")).toBeNull()
    expect(decodePreview("a.b")).toBeNull()
  })

  it("rejeita papel fora do conjunto atribuível", () => {
    // "owner" não é atribuível: uma prévia como dono não faria sentido e
    // reintroduziria escrita.
    const forged = Buffer.from(
      JSON.stringify({ role: "owner", ownerUserId: "o1", startedAt: Date.now() }),
    ).toString("base64url")
    expect(decodePreview(forged)).toBeNull()
  })

  it("expira pela janela mesmo se o cookie sobreviver", () => {
    const old = Date.now() - 31 * 60 * 1000
    const spy = vi.spyOn(Date, "now").mockReturnValue(old)
    const raw = encodePreview("manager", "owner-1")
    spy.mockRestore()
    expect(decodePreview(raw)).toBeNull()
  })
})
