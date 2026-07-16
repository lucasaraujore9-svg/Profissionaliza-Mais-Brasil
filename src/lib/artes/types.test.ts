import { describe, expect, it } from "vitest"
import {
  ART_ANCHORS,
  anchorsFor,
  contrastTextColor,
  formatPriceBRL,
  mirrorBoxLeft,
  normalizeSocialHandle,
  slugifyFilename,
  textOnWhite,
} from "./types"

describe("anchorsFor", () => {
  it("seleciona âncoras de feed para 1080x1350 e 1080x1080", () => {
    expect(anchorsFor(1080, 1350)).toBe(ART_ANCHORS.feed)
    expect(anchorsFor(1080, 1080)).toBe(ART_ANCHORS.feed)
  })

  it("seleciona âncoras de story para 1080x1920", () => {
    expect(anchorsFor(1080, 1920)).toBe(ART_ANCHORS.story)
  })
})

describe("mirrorBoxLeft", () => {
  it("espelha a caixa mantendo a margem da borda", () => {
    const mirrored = mirrorBoxLeft({ x: 0.7, y: 0.03, w: 0.28, h: 0.11 })
    expect(mirrored.x).toBeCloseTo(0.02)
    expect(mirrored.w).toBe(0.28)
    expect(mirrored.y).toBe(0.03)
  })
})

describe("textOnWhite", () => {
  it("mantém cor escura da unidade", () => {
    expect(textOnWhite("#1e40af")).toBe("#1e40af")
    expect(textOnWhite("#111")).toBe("#111111")
  })

  it("cor clara ou inválida cai no azul-marinho neutro", () => {
    expect(textOnWhite("#f5d90a")).toBe("#1e293b")
    expect(textOnWhite("#fff")).toBe("#1e293b")
    expect(textOnWhite("azul")).toBe("#1e293b")
  })
})

describe("normalizeSocialHandle", () => {
  it("normaliza URL completa do Instagram", () => {
    expect(normalizeSocialHandle("https://www.instagram.com/minharevenda/")).toBe(
      "@minharevenda",
    )
  })

  it("normaliza URL do YouTube com @handle no path", () => {
    expect(normalizeSocialHandle("https://youtube.com/@meucanal")).toBe("@meucanal")
  })

  it("mantem handle ja prefixado com @", () => {
    expect(normalizeSocialHandle("@minharevenda")).toBe("@minharevenda")
  })

  it("prefixa handle puro com @", () => {
    expect(normalizeSocialHandle("minharevenda")).toBe("@minharevenda")
  })

  it("descarta query string", () => {
    expect(normalizeSocialHandle("instagram.com/loja?igsh=abc")).toBe("@loja")
  })

  it("retorna null para vazio/nulo", () => {
    expect(normalizeSocialHandle(null)).toBeNull()
    expect(normalizeSocialHandle("")).toBeNull()
    expect(normalizeSocialHandle("   ")).toBeNull()
    expect(normalizeSocialHandle("https://instagram.com/")).toBeNull()
  })
})

describe("contrastTextColor", () => {
  it("fundo escuro -> texto branco", () => {
    expect(contrastTextColor("#2563eb")).toBe("#ffffff")
    expect(contrastTextColor("#000000")).toBe("#ffffff")
  })

  it("fundo claro -> texto escuro", () => {
    expect(contrastTextColor("#ffffff")).toBe("#111827")
    expect(contrastTextColor("#f5d90a")).toBe("#111827")
  })

  it("aceita formato #rgb curto", () => {
    expect(contrastTextColor("#fff")).toBe("#111827")
    expect(contrastTextColor("#000")).toBe("#ffffff")
  })

  it("hex invalido -> branco (fundo presumido colorido)", () => {
    expect(contrastTextColor("azul")).toBe("#ffffff")
  })
})

describe("formatPriceBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    // Intl usa espaco nao separavel entre R$ e o numero
    expect(formatPriceBRL(19990).replace(/\u00a0/g, " ")).toBe("R$ 199,90")
    expect(formatPriceBRL(100).replace(/\u00a0/g, " ")).toBe("R$ 1,00")
  })
})

describe("slugifyFilename", () => {
  it("remove acentos e simbolos", () => {
    expect(slugifyFilename("Promoção de Férias! 50%")).toBe("promocao-de-ferias-50")
  })

  it("fallback para 'arte' quando nada sobra", () => {
    expect(slugifyFilename("!!!")).toBe("arte")
  })
})
