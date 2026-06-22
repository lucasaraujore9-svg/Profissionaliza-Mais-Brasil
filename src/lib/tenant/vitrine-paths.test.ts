import { describe, expect, it } from "vitest"
import { isVitrinePath } from "./vitrine-paths"

describe("isVitrinePath", () => {
  it("trata raiz e catálogo da vitrine", () => {
    expect(isVitrinePath("/")).toBe(true)
    expect(isVitrinePath("/cursos")).toBe(true)
    // /cursos/x NÃO é vitrine (evita 404 em /loja/cursos/x)
    expect(isVitrinePath("/cursos/algo")).toBe(false)
  })

  it("reescreve detalhe de curso e checkout", () => {
    expect(isVitrinePath("/curso/excel-basico")).toBe(true)
    expect(isVitrinePath("/checkout")).toBe(true)
    expect(isVitrinePath("/confirmacao/123")).toBe(true)
    expect(isVitrinePath("/pagar/abc")).toBe(true)
  })

  it("REGRESSÃO: detalhe de combo (/pacote/:slug) é caminho de vitrine", () => {
    expect(
      isVitrinePath(
        "/pacote/informatica-completa-windows-word-excel-powerpoint-e-internet",
      ),
    ).toBe(true)
    expect(isVitrinePath("/pacote")).toBe(true)
  })

  it("não confunde /pacote com /pacotes (índice do site principal PMB)", () => {
    // /pacotes (plural) é rota do site principal; não deve ser reescrita p/ /loja.
    expect(isVitrinePath("/pacotes")).toBe(false)
    expect(isVitrinePath("/pacotes/algum-combo")).toBe(false)
  })

  it("deixa passar rotas do site principal / painel / admin", () => {
    expect(isVitrinePath("/admin")).toBe(false)
    expect(isVitrinePath("/painel/cursos")).toBe(false)
    expect(isVitrinePath("/login")).toBe(false)
    expect(isVitrinePath("/sobre")).toBe(false)
  })
})
