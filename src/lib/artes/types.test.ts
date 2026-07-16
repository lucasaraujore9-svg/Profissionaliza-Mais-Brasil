import { describe, expect, it } from "vitest"
import {
  contrastTextColor,
  formatPriceBRL,
  normalizeSocialHandle,
  slugifyFilename,
} from "./types"

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
