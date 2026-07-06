import { describe, it, expect } from "vitest"
import {
  whatsappIntlNumber,
  buildWhatsappLink,
  buildTenantSupportContacts,
} from "./branding"

describe("whatsappIntlNumber — botão flutuante da vitrine", () => {
  it("celular com DDD ganha o DDI 55", () => {
    expect(whatsappIntlNumber("(11) 99999-9999")).toBe("5511999999999")
  })

  it("telefone fixo com DDD ganha o DDI 55 (WhatsApp Business em linha fixa)", () => {
    expect(whatsappIntlNumber("(11) 4004-1234")).toBe("551140041234")
  })

  it("0800 é aceito: remove o zero de tronco e acrescenta o DDI", () => {
    expect(whatsappIntlNumber("0800 441 4321")).toBe("558004414321")
  })

  it("celular discado com tronco 0 (0XX) remove o zero e acrescenta o DDI", () => {
    expect(whatsappIntlNumber("011 99999-9999")).toBe("5511999999999")
  })

  it("número já internacional (+55) é preservado", () => {
    expect(whatsappIntlNumber("+55 11 99999-9999")).toBe("5511999999999")
  })

  it("DDD 55 (RS) sem DDI não é confundido com internacional", () => {
    // 55 (DDD) + 99999-9999 → 11 dígitos, ainda nacional → recebe DDI 55.
    expect(whatsappIntlNumber("55 99999-9999")).toBe("5555999999999")
  })

  it("número SEM DDD é rejeitado (não gera wa.me quebrado)", () => {
    // Piso de 10 dígitos nacionais (DDD + número), igual ao rodapé. Antes um
    // celular/fixo sem DDD ganhava DDI 55 e virava link inválido.
    expect(whatsappIntlNumber("99999-9999")).toBeNull() // 9 dígitos, sem DDD
    expect(whatsappIntlNumber("4004-1234")).toBeNull() // 8 dígitos, sem DDD
  })

  it("prefixo de discagem internacional 00 preserva o número estrangeiro", () => {
    // 00 (discagem internacional) + 1 (EUA) + assinante: não vira número BR.
    expect(whatsappIntlNumber("00 1 555 123 4567")).toBe("15551234567")
  })

  it("rejeita entradas curtas demais para um telefone", () => {
    expect(whatsappIntlNumber("1234")).toBeNull()
    expect(whatsappIntlNumber("")).toBeNull()
    expect(whatsappIntlNumber(null)).toBeNull()
    expect(whatsappIntlNumber(undefined)).toBeNull()
  })
})

describe("buildWhatsappLink", () => {
  it("monta o link wa.me sem mensagem", () => {
    expect(buildWhatsappLink("(11) 99999-9999")).toBe(
      "https://wa.me/5511999999999",
    )
  })

  it("anexa a mensagem pré-preenchida url-encoded", () => {
    expect(
      buildWhatsappLink("(11) 99999-9999", "Olá! Quero saber dos cursos."),
    ).toBe(
      "https://wa.me/5511999999999?text=Ol%C3%A1!%20Quero%20saber%20dos%20cursos.",
    )
  })

  it("ignora mensagem só com espaços", () => {
    expect(buildWhatsappLink("(11) 99999-9999", "   ")).toBe(
      "https://wa.me/5511999999999",
    )
  })

  it("retorna null quando não há número utilizável", () => {
    expect(buildWhatsappLink(null)).toBeNull()
    expect(buildWhatsappLink("123")).toBeNull()
  })
})

describe("buildTenantSupportContacts — rodapé usa a mesma normalização do FAB", () => {
  it("celular comum: wa.me com DDI 55", () => {
    const c = buildTenantSupportContacts({ whatsapp: "(11) 99999-9999" })
    expect(c.isWhatsapp).toBe(true)
    expect(c.phoneUrl).toBe("https://wa.me/5511999999999")
  })

  it("DDD 55 (RS): rodapé e FAB apontam para o MESMO número (bug antigo)", () => {
    // Antes o rodapé tratava o DDD 55 como DDI e emitia wa.me/55999999999.
    const c = buildTenantSupportContacts({ whatsapp: "(55) 99999-9999" })
    expect(c.phoneUrl).toBe(`https://wa.me/${whatsappIntlNumber("(55) 99999-9999")}`)
    expect(c.phoneUrl).toBe("https://wa.me/5555999999999")
  })

  it("0800 segue como telefone (tel:), não WhatsApp", () => {
    const c = buildTenantSupportContacts({ whatsapp: "0800 441 4321" })
    expect(c.isWhatsapp).toBe(false)
    expect(c.phoneUrl).toBe("tel:08004414321")
  })
})
