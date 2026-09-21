import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { InstitutionalSection, ICON_MAP } from "./section-renderers"
import type { InstitutionalConfig } from "@/lib/home/sections"
import {
  INSTITUTIONAL_ICON_NAMES,
  INSTITUTIONAL_FIELDS,
} from "@/lib/home/institutional-fields"

// A barra de benefícios desenhava SÓ os selos, mas o editor da vitrine oferecia
// título, subtítulo e texto principal para toda variante. Três unidades em
// produção (capacitaprobrasil, pvo-educacao, oportunizafuturo) escreveram um
// anúncio inteiro ali e a home o descartou em silêncio.

function trustBar(over: Partial<InstitutionalConfig> = {}): InstitutionalConfig {
  return {
    kind: "institutional",
    variant: "trust_bar",
    title: "",
    subtitle: "",
    body: "",
    imageUrl: null,
    buttonText: null,
    buttonHref: null,
    secondaryButtonText: null,
    secondaryButtonHref: null,
    items: [
      { title: "Certificado incluso", body: "Reconhecido em todo Brasil", iconName: "Award", imageUrl: null, meta: null },
    ],
    ...over,
  }
}

const render = (c: InstitutionalConfig, semJurosText?: string) =>
  renderToStaticMarkup(
    <InstitutionalSection config={c} semJurosText={semJurosText} />,
  )

describe("trust_bar — cabeçalho editável", () => {
  it("exibe título, subtítulo e texto quando preenchidos", () => {
    const html = render(
      trustBar({
        title: "COMBO BEAUTY PRO | ASSINATURA",
        subtitle: "12 cursos por R$ 34,90/mês",
        body: "Cabelo, unhas, maquiagem e barbearia.",
      }),
    )
    expect(html).toContain("COMBO BEAUTY PRO | ASSINATURA")
    expect(html).toContain("12 cursos por R$ 34,90/mês")
    expect(html).toContain("Cabelo, unhas, maquiagem e barbearia.")
    // Os selos continuam.
    expect(html).toContain("Certificado incluso")
  })

  it("sem cabeçalho preenchido, renderiza só os selos (comportamento antigo)", () => {
    const html = render(trustBar())
    expect(html).toContain("Certificado incluso")
    expect(html).not.toContain("<h2")
  })

  it("substitui os tokens dinâmicos também no cabeçalho", () => {
    const html = render(trustBar({ body: "Pague {{semJuros}}" }), "em até 10x sem juros")
    expect(html).toContain("em até 10x sem juros")
    expect(html).not.toContain("{{semJuros}}")
  })

  it("sem item nenhum a seção não aparece", () => {
    expect(render(trustBar({ title: "Oi", items: [] }))).toBe("")
  })
})

describe("catálogo de ícones do editor", () => {
  it("é exatamente o que o renderer conhece", () => {
    // Opção no select que o ICON_MAP não tem = o dono escolhe um ícone e a home
    // o descarta sem dizer nada.
    expect([...INSTITUTIONAL_ICON_NAMES].sort()).toEqual(
      Object.keys(ICON_MAP).sort(),
    )
  })
})

describe("INSTITUTIONAL_FIELDS", () => {
  it("marca items para as variantes cujo render depende deles", () => {
    // testimonials/benefits/trust_bar/learn_anywhere desenham `config.items`;
    // final_cta e custom não — oferecer a lista lá seria o mesmo bug de novo.
    expect(INSTITUTIONAL_FIELDS.trust_bar.items).toBe(true)
    expect(INSTITUTIONAL_FIELDS.testimonials.items).toBe(true)
    expect(INSTITUTIONAL_FIELDS.benefits.items).toBe(true)
    expect(INSTITUTIONAL_FIELDS.learn_anywhere.items).toBe(true)
    expect(INSTITUTIONAL_FIELDS.final_cta.items).toBe(false)
    expect(INSTITUTIONAL_FIELDS.custom.items).toBe(false)
  })

  it("só o final_cta tem botão secundário, e o benefits não tem texto principal", () => {
    expect(INSTITUTIONAL_FIELDS.final_cta.secondaryButton).toBe(true)
    expect(INSTITUTIONAL_FIELDS.trust_bar.secondaryButton).toBe(false)
    expect(INSTITUTIONAL_FIELDS.benefits.body).toBe(false)
  })
})
