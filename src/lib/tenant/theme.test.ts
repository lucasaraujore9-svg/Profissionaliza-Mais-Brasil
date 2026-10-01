import { describe, expect, it } from "vitest"
import {
  DEFAULT_THEME,
  contrastRatio,
  parseTheme,
  readableOn,
  resolveTheme,
  safeHex,
  tenantThemeCss,
  themeWarnings,
} from "./theme"

const BLUE = "#2563eb" // azul padrão do banco
const NAVY = "#1e40af"
const YELLOW = "#ffe600"

describe("safeHex", () => {
  it("normaliza a forma curta e a caixa", () => {
    expect(safeHex("#ABC")).toBe("#aabbcc")
    expect(safeHex(" #1E40AF ")).toBe("#1e40af")
  })

  it("descarta tudo que não é hex — o valor vai dentro de <style>", () => {
    expect(safeHex("red")).toBeNull()
    expect(safeHex("#12345")).toBeNull()
    expect(safeHex("#fff;}body{display:none")).toBeNull()
    expect(safeHex(null)).toBeNull()
    expect(safeHex(123)).toBeNull()
  })
})

describe("parseTheme", () => {
  it("resolve qualquer entrada inválida para o automático, sem lançar", () => {
    for (const raw of [null, undefined, "x", 7, [], { buttonBg: "nope" }]) {
      expect(parseTheme(raw)).toEqual(DEFAULT_THEME)
    }
  })

  it("mantém só cor válida e tom conhecido", () => {
    const theme = parseTheme({
      buttonBg: "#F00",
      darkText: "javascript:alert(1)",
      headerTone: "dark",
      footerTone: "roxo",
      intruso: "#000000",
    })
    expect(theme.buttonBg).toBe("#ff0000")
    expect(theme.darkText).toBeNull()
    expect(theme.headerTone).toBe("dark")
    expect(theme.footerTone).toBe("dark") // padrão, não "roxo"
    expect(theme).not.toHaveProperty("intruso")
  })
})

describe("resolveTheme — automático", () => {
  it("unidade no padrão da plataforma não é personalizada", () => {
    const t = resolveTheme({ primaryColor: "#025918", secondaryColor: "#F2B705" })
    expect(t.isDefault).toBe(true)
    expect(tenantThemeCss({ primaryColor: "#025918", secondaryColor: "#F2B705" })).toBeNull()
    expect(tenantThemeCss(null)).toBeNull()
  })

  it("cor escura: botão, área escura e título herdam a principal, com texto branco", () => {
    const t = resolveTheme({ primaryColor: BLUE, secondaryColor: NAVY })
    expect(t.btn).toBe(BLUE)
    expect(t.dark).toBe(BLUE)
    expect(t.ink).toBe(BLUE)
    expect(t.btnOn).toBe("#ffffff")
    expect(t.darkOn).toBe("#ffffff")
    expect(t.cta).toBe(NAVY)
    expect(t.ctaOn).toBe("#ffffff")
  })

  it("cor clara: o texto vira tinta escura e o título é escurecido até dar leitura", () => {
    const t = resolveTheme({ primaryColor: YELLOW, secondaryColor: YELLOW })
    expect(t.btn).toBe(YELLOW)
    expect(t.btnOn).not.toBe("#ffffff")
    expect(contrastRatio(t.btnOn, t.btn)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t.darkOn, t.dark)).toBeGreaterThanOrEqual(4.5)
    expect(t.ink).not.toBe(YELLOW)
    expect(contrastRatio(t.ink, "#ffffff")).toBeGreaterThanOrEqual(4.5)
  })

  it("laranja e azul-claro de marca mantêm o texto branco (calibrado em produção)", () => {
    for (const hex of ["#eb7d24", "#db7e14", "#249eeb"]) {
      const t = resolveTheme({ primaryColor: hex, secondaryColor: hex })
      expect(t.darkOn, hex).toBe("#ffffff")
      expect(t.ink, hex).toBe(hex)
    }
  })

  it("o automático nunca produz par ilegível, para nenhuma cor", () => {
    for (let i = 0; i < 4096; i += 7) {
      const hex = `#${i.toString(16).padStart(3, "0")}`
      const source = { primaryColor: hex, secondaryColor: hex }
      expect(themeWarnings(source), hex).toEqual([])
    }
  })

  it("detalhe colorido da área escura só fica se der para ler ali", () => {
    const dark = resolveTheme({ primaryColor: "#111111", secondaryColor: "#f59e0b" })
    expect(dark.darkAccent).toBe("#c0d904")
    expect(dark.darkHighlight).toBe("#f59e0b")
    // Faixa amarela: lime e destaque amarelo somem — viram a cor do texto.
    const light = resolveTheme({ primaryColor: YELLOW, secondaryColor: YELLOW })
    expect(light.darkAccent).toBe(light.darkOn)
    expect(light.darkHighlight).toBe(light.darkOn)
  })

  it("hover do botão é mais escuro que o botão", () => {
    const t = resolveTheme({ primaryColor: BLUE, secondaryColor: NAVY })
    expect(t.btnHover).not.toBe(t.btn)
    expect(contrastRatio(t.btnHover, "#ffffff")).toBeGreaterThan(
      contrastRatio(t.btn, "#ffffff"),
    )
  })
})

describe("resolveTheme — ajuste manual", () => {
  it("cada papel é independente da cor principal", () => {
    const t = resolveTheme({
      primaryColor: BLUE,
      secondaryColor: NAVY,
      theme: {
        buttonBg: "#ff0000",
        buttonText: "#000000",
        ctaBg: "#00ff00",
        lightTitle: "#333333",
        darkBg: "#101010",
        darkText: "#eeeeee",
      },
    })
    expect(t.btn).toBe("#ff0000")
    expect(t.btnOn).toBe("#000000")
    expect(t.cta).toBe("#00ff00")
    expect(t.ink).toBe("#333333")
    expect(t.dark).toBe("#101010")
    expect(t.darkOn).toBe("#eeeeee")
  })

  it("texto automático acompanha o fundo escolhido à mão", () => {
    const t = resolveTheme({
      primaryColor: BLUE,
      secondaryColor: NAVY,
      theme: { darkBg: "#fafafa" },
    })
    expect(t.darkOn).toBe(readableOn("#fafafa"))
    expect(t.darkOn).not.toBe("#ffffff")
  })

  it("avisa par ilegível e aponta o campo que volta ao automático", () => {
    const warnings = themeWarnings({
      primaryColor: BLUE,
      secondaryColor: NAVY,
      theme: { buttonBg: "#ffffff", buttonText: "#fefefe", lightTitle: "#fdfdfd" },
    })
    expect(warnings.map((w) => w.fix).sort()).toEqual(["buttonText", "lightTitle"])
  })
})

describe("tenantThemeCss", () => {
  it("emite os tokens em :root e troca a rampa da marca pela tinta", () => {
    const css = tenantThemeCss({ primaryColor: BLUE, secondaryColor: NAVY })!
    expect(css.startsWith(":root{")).toBe(true)
    expect(css).toContain(`--brand-btn:${BLUE}`)
    expect(css).toContain(`--brand-dark:${BLUE}`)
    expect(css).toContain(`--color-pmb-green:${BLUE}`)
    expect(css).toContain(`--color-pmb-green-900:${BLUE}`)
    expect(css).toContain(`--color-pmb-gold:${NAVY}`)
    expect(css).toContain(`--primary:${BLUE}`)
  })

  it("só o tema ajustado (cores da plataforma) também gera CSS", () => {
    const css = tenantThemeCss({
      primaryColor: "#025918",
      secondaryColor: "#F2B705",
      theme: { buttonBg: "#ff0000" },
    })!
    expect(css).toContain("--brand-btn:#ff0000")
    // A rampa calibrada da plataforma continua valendo.
    expect(css).not.toContain("--color-pmb-green")
  })

  it("nada que não seja hex chega ao CSS", () => {
    const css = tenantThemeCss({
      primaryColor: "#fff}body{display:none",
      secondaryColor: NAVY,
      theme: { darkBg: "red;}*{color:red" },
    })!
    expect(css).not.toMatch(/display|red/)
    expect(css.match(/[{}]/g)).toEqual(["{", "}"])
  })
})

describe("cobertura — toda área da unidade aplica o tema", () => {
  // A área do aluno ficou anos só com o menu colorido porque o layout dela
  // montava as cores à mão. Layout novo que sirva unidade entra nesta lista.
  const LAYOUTS = [
    "src/app/loja/layout.tsx",
    "src/app/(main)/layout.tsx",
    "src/app/(auth)/layout.tsx",
    "src/app/aluno/layout.tsx",
  ]

  it.each(LAYOUTS)("%s usa TenantThemeStyle e não monta cor à mão", async (file) => {
    const { readFileSync } = await import("node:fs")
    const source = readFileSync(file, "utf8")
    expect(source).toContain("<TenantThemeStyle")
    expect(source).not.toMatch(/["']--color-pmb-(green|gold)/)
  })
})
