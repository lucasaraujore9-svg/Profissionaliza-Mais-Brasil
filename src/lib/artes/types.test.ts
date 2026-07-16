import { describe, expect, it } from "vitest"
import {
  ART_ANCHORS,
  anchorsFor,
  clampLogoPlacement,
  clampPricePlacement,
  contrastTextColor,
  defaultVariantLayout,
  footerGroups,
  formatPriceBRL,
  mirrorBoxLeft,
  normalizeSocialHandle,
  resolveVariantLayout,
  slugifyFilename,
  textOnWhite,
  type ArtItem,
  type TenantBrand,
} from "./types"

describe("defaultVariantLayout", () => {
  it("centraliza o logo na âncora legada (top-right)", () => {
    const layout = defaultVariantLayout("feed", "top-right", false)
    const box = ART_ANCHORS.feed.logoBox
    expect(layout.logo.cx).toBeCloseTo(box.x + box.w / 2)
    expect(layout.logo.cy).toBeCloseTo(box.y + box.h / 2)
    expect(layout.logo.w).toBe(box.w)
    expect(layout.price).toBeUndefined()
    expect(layout.logo.bg).toBe(false)
    expect(layout.footerBg).toBe(true)
  })

  it("espelha o cx para top-left", () => {
    const right = defaultVariantLayout("feed", "top-right", false)
    const left = defaultVariantLayout("feed", "top-left", false)
    expect(left.logo.cx).toBeCloseTo(1 - right.logo.cx)
    expect(left.logo.cy).toBe(right.logo.cy)
  })

  it("inclui price com scale 1 quando hasPrice", () => {
    const layout = defaultVariantLayout("story", "top-right", true)
    expect(layout.price).toBeDefined()
    expect(layout.price!.scale).toBe(1)
  })
})

describe("clampLogoPlacement / clampPricePlacement", () => {
  it("mantém a caixa do logo dentro do canvas", () => {
    const p = clampLogoPlacement({ cx: 0.01, cy: 0.99, w: 0.3, h: 0.1, bg: false })
    expect(p.cx).toBeCloseTo(0.15)
    expect(p.cy).toBeCloseTo(0.95)
  })

  it("limita o centro e a escala do preço", () => {
    const p = clampPricePlacement({ cx: 1.5, cy: -1, scale: 9 })
    expect(p.cx).toBe(0.97)
    expect(p.cy).toBe(0.03)
    expect(p.scale).toBe(2.5)
  })
})

describe("resolveVariantLayout", () => {
  const baseArt: ArtItem = {
    id: "a1",
    title: "Arte",
    category: null,
    feed: { url: "u", width: 1080, height: 1350 },
    story: null,
    hasPrice: true,
    logoCorner: "top-right",
    layout: null,
  }

  it("layout null cai no default", () => {
    const layout = resolveVariantLayout(baseArt, "feed")
    expect(layout.footerBg).toBe(true)
    expect(layout.price).toBeDefined()
  })

  it("usa o layout salvo e injeta price default quando hasPrice sem price salvo", () => {
    const art: ArtItem = {
      ...baseArt,
      layout: {
        feed: { logo: { cx: 0.3, cy: 0.2, w: 0.2, h: 0.1, bg: true }, footerBg: false },
      },
    }
    const layout = resolveVariantLayout(art, "feed")
    expect(layout.logo.cx).toBeCloseTo(0.3)
    expect(layout.logo.bg).toBe(true)
    expect(layout.footerBg).toBe(false)
    expect(layout.price).toBeDefined() // injetado do default
  })
})

describe("footerGroups", () => {
  const brand: TenantBrand = {
    name: "Unidade",
    slug: "u",
    logoUrl: null,
    primaryColor: "#1e40af",
    secondaryColor: "#1e40af",
    siteHost: "u.livrecursos.com.br",
    whatsapp: "(11) 99999-9999",
    social: { kind: "instagram", handle: "@u" },
  }

  it("ordena site → whatsapp → rede com o kind do ícone", () => {
    const groups = footerGroups(brand)
    expect(groups.map((g) => g.icon)).toEqual(["globe", "whatsapp", "instagram"])
    expect(groups[0].text).toBe("u.livrecursos.com.br")
  })

  it("omite ausentes", () => {
    const groups = footerGroups({ ...brand, whatsapp: null, social: null })
    expect(groups).toHaveLength(1)
  })
})

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
