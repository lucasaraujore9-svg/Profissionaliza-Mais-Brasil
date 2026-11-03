import { describe, expect, it } from "vitest"
import { pdfSafeText } from "./text"

describe("pdfSafeText", () => {
  it("troca letra fora do WinAnsi pela base sem acento, em vez de sumir", () => {
    expect(pdfSafeText("VIRCĖLIA AZEVEDO SILVA")).toBe("VIRCELIA AZEVEDO SILVA")
    expect(pdfSafeText("Vircėlia")).toBe("Vircelia")
  })

  it("preserva os acentos do portugues e os extras do cp1252", () => {
    const pt = "JOÃO CONCEIÇÃO ÁÉÍÓÚ ÂÊÔ À Ü – “x” €"
    expect(pdfSafeText(pt)).toBe(pt)
  })
})
