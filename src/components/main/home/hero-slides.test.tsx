import { describe, it, expect } from "vitest"
import { allBannersFailed } from "./hero-slides"

// Regra "nunca tela preta": quando TODAS as imagens do banner falham ao carregar
// (ex.: Supabase Storage 402/indisponível), o HeroSlides cai no hero padrão da
// unidade em vez de exibir um bloco preto. Esta é a lógica de decisão pura.
describe("allBannersFailed", () => {
  it("false quando não há banner (total = 0)", () => {
    expect(allBannersFailed(new Set(), 0)).toBe(false)
  })

  it("false enquanto ao menos uma imagem ainda pode carregar", () => {
    expect(allBannersFailed(new Set([0]), 2)).toBe(false)
  })

  it("true quando todas as imagens falharam", () => {
    expect(allBannersFailed(new Set([0, 1]), 2)).toBe(true)
  })

  it("true no caso de um slide único cuja imagem falhou", () => {
    expect(allBannersFailed(new Set([0]), 1)).toBe(true)
  })
})
