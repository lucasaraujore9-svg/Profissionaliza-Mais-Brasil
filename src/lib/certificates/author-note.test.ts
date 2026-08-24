import { describe, expect, it } from "vitest"
import { authorResponsibilityNote } from "./templates/info-page"
import { RENDER_REVISION_AT } from "./freshness"

/* Nota de responsabilidade no VERSO do certificado.
   O certificado é documento oficial e já circulou: o que este arquivo protege é
   que a nota apareça só onde deve e que o PDF antigo seja de fato regerado. */

describe("authorResponsibilityNote", () => {
  it("não imprime nada em curso do catálogo da PMB", () => {
    // A esmagadora maioria. Uma isenção dizendo que a plataforma "não responde"
    // impressa num curso da PRÓPRIA plataforma seria pior que nota nenhuma.
    expect(authorResponsibilityNote(null)).toBeNull()
    expect(authorResponsibilityNote(undefined)).toBeNull()
    expect(authorResponsibilityNote("")).toBeNull()
    expect(authorResponsibilityNote("   ")).toBeNull()
  })

  it("nomeia a unidade autora", () => {
    const nota = authorResponsibilityNote("Polo Betim")
    expect(nota).toContain("Polo Betim")
    expect(nota).toContain("autoria e responsabilidade")
  })

  it("isenta as três marcas, nominalmente", () => {
    const nota = authorResponsibilityNote("Polo Betim") ?? ""
    expect(nota).toContain("Profissionaliza Mais Brasil")
    expect(nota).toContain("Livre Cursos")
    expect(nota).toContain("Grupo Bolsa Mais Brasil")
  })

  it("é curta — é nota de rodapé, não um bloco jurídico", () => {
    // O pedido foi "de forma bem sutil". Um parágrafo longo no verso competiria
    // com a fundamentação legal e mudaria o peso do documento.
    const nota = authorResponsibilityNote("Polo Betim") ?? ""
    expect(nota.length).toBeLessThan(420)
  })
})

describe("regeneração do PDF", () => {
  it("RENDER_REVISION_AT cobre esta mudança de layout", () => {
    // Mudança no CÓDIGO de render não invalida PDF já gerado sozinha: quem
    // invalida é esta data. Sem o bump, a nota só apareceria em certificados
    // NOVOS e os já emitidos continuariam sem ela.
    expect(RENDER_REVISION_AT.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-08-25T00:00:00Z").getTime(),
    )
  })

  it("a data é meia-noite UTC, não um instante qualquer", () => {
    // Ancorar em "agora" deixaria os PDFs gerados entre o commit e o deploy
    // marcados como atuais, preservando o conteúdo antigo.
    expect(RENDER_REVISION_AT.getUTCHours()).toBe(0)
    expect(RENDER_REVISION_AT.getUTCMinutes()).toBe(0)
    expect(RENDER_REVISION_AT.getUTCSeconds()).toBe(0)
  })
})
