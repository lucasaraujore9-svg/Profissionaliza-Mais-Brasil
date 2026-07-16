import { describe, expect, it } from "vitest"
import { checkArtDimensions, checkArtVariantDimensions } from "./image-dims"

// Monta um cabecalho PNG minimo valido (assinatura + IHDR com width/height).
function pngHeader(width: number, height: number): Buffer {
  const b = Buffer.alloc(32)
  b[0] = 0x89
  b[1] = 0x50
  b[2] = 0x4e
  b[3] = 0x47
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

describe("checkArtDimensions", () => {
  it("aceita arte dentro dos limites", () => {
    expect(checkArtDimensions(pngHeader(1080, 1350), "image/png").ok).toBe(true)
  })

  it("rejeita arte pequena e arte acima do maxSide", () => {
    expect(checkArtDimensions(pngHeader(400, 400), "image/png").ok).toBe(false)
    expect(checkArtDimensions(pngHeader(5000, 1080), "image/png").ok).toBe(false)
  })
})

describe("checkArtVariantDimensions", () => {
  it("feed aceita quadrado e 4:5", () => {
    expect(checkArtVariantDimensions(pngHeader(1080, 1080), "image/png", "feed").ok).toBe(true)
    expect(checkArtVariantDimensions(pngHeader(1080, 1350), "image/png", "feed").ok).toBe(true)
  })

  it("feed rejeita arquivo vertical de stories (troca de arquivos)", () => {
    const r = checkArtVariantDimensions(pngHeader(1080, 1920), "image/png", "feed")
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/stories/i)
  })

  it("story aceita 9:16", () => {
    expect(checkArtVariantDimensions(pngHeader(1080, 1920), "image/png", "story").ok).toBe(true)
  })

  it("story rejeita arquivo quadrado/4:5 (troca de arquivos)", () => {
    const r = checkArtVariantDimensions(pngHeader(1080, 1350), "image/png", "story")
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/feed/i)
  })
})
