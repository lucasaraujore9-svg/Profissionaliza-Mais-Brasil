import { describe, expect, it } from "vitest"
import { isVitrinePath, storePath } from "./vitrine-paths"

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

describe("storePath", () => {
  it("FE-003: host de vitrine (URL sem /loja) → alvo SEM prefixo /loja", () => {
    // No subdomínio de revenda o browser mostra /checkout (rewrite do proxy é
    // transparente); a confirmação não pode vazar o prefixo interno /loja.
    expect(storePath("/checkout", "/confirmacao")).toBe("/confirmacao")
    expect(storePath("/pagar/abc", "/confirmacao")).toBe("/confirmacao")
    expect(storePath("/", "/confirmacao")).toBe("/confirmacao")
  })

  it("FE-003: host PMB (URL sob /loja) → alvo COM prefixo /loja", () => {
    // No host PMB a vitrine é servida direto em /loja/* (sem rewrite); a
    // confirmação precisa do prefixo /loja senão daria 404.
    expect(storePath("/loja/checkout", "/confirmacao")).toBe(
      "/loja/confirmacao",
    )
    expect(storePath("/loja/pagar/abc", "/confirmacao")).toBe(
      "/loja/confirmacao",
    )
    expect(storePath("/loja", "/confirmacao")).toBe("/loja/confirmacao")
  })

  it("não confunde prefixo /loja com rota que apenas começa com essas letras", () => {
    expect(storePath("/lojas-parceiras", "/confirmacao")).toBe("/confirmacao")
  })
})

describe("assinaturas na vitrine da unidade", () => {
  it("a listagem e o detalhe sao servidos pela vitrine", () => {
    // Sem isto, /assinatura/:slug num subdomínio de revenda cairia no site
    // principal — que só tem /assinaturas (produto da PMB) e responde 404 ali
    // de propósito, deixando o link "Assinar" da unidade quebrado.
    expect(isVitrinePath("/assinaturas")).toBe(true)
    expect(isVitrinePath("/assinatura/plano-total")).toBe(true)
    expect(isVitrinePath("/assinatura")).toBe(true)
  })

  it("nao captura o caminho do painel do aluno", () => {
    // /aluno/assinatura é área logada, servida pelo site principal mesmo em
    // subdomínio de revenda.
    expect(isVitrinePath("/aluno/assinatura")).toBe(false)
  })

  it("nao captura sufixos parecidos", () => {
    expect(isVitrinePath("/assinaturas-antigas")).toBe(false)
  })
})
