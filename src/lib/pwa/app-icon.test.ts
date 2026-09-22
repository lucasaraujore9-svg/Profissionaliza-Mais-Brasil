import { describe, it, expect } from "vitest"
import {
  APP_ICON_DARK_BG,
  APP_ICON_LIGHT_BG,
  averageVisibleLuminance,
  backgroundForLuminance,
} from "./app-icon"

function rgba(pixels: [number, number, number, number][]): number[] {
  return pixels.flat()
}

describe("app-icon", () => {
  it("logo clara ganha fundo escuro", () => {
    const lum = averageVisibleLuminance(rgba([[255, 255, 255, 255]]))
    expect(backgroundForLuminance(lum)).toBe(APP_ICON_DARK_BG)
  })

  it("logo escura ganha fundo claro", () => {
    const lum = averageVisibleLuminance(rgba([[10, 10, 10, 255]]))
    expect(backgroundForLuminance(lum)).toBe(APP_ICON_LIGHT_BG)
  })

  // O caso que motiva o alpha: logo branca sobre PNG transparente. Se o vazio
  // entrasse na media, a imagem passaria por escura e ganharia fundo branco —
  // logo branca invisivel no atalho.
  it("ignora o vazio transparente ao medir o brilho", () => {
    const lum = averageVisibleLuminance(
      rgba([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [250, 250, 250, 255],
      ]),
    )
    expect(backgroundForLuminance(lum)).toBe(APP_ICON_DARK_BG)
  })

  it("imagem toda transparente cai no fundo claro", () => {
    expect(averageVisibleLuminance(rgba([[255, 255, 255, 0]]))).toBeNull()
    expect(backgroundForLuminance(null)).toBe(APP_ICON_LIGHT_BG)
  })
})
