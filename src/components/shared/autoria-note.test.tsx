import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AutoriaNote } from "./autoria-note"

/* Nota de responsabilidade pelo conteudo de curso produzido por uma unidade.
   O que nao pode regredir: ela some para o catalogo da PMB (a esmagadora
   maioria dos cursos) e nomeia a unidade quando existe. Uma nota dizendo que a
   plataforma "nao se responsabiliza" impressa num curso da PROPRIA plataforma
   seria pior do que nao ter nota nenhuma. */

describe("AutoriaNote", () => {
  it("nao renderiza nada para curso do catalogo da PMB", () => {
    expect(renderToStaticMarkup(<AutoriaNote authorName={null} />)).toBe("")
    expect(renderToStaticMarkup(<AutoriaNote authorName={undefined} />)).toBe("")
    // String vazia e so espaco tambem contam como "sem autor": o nome vem de um
    // campo de texto livre da unidade.
    expect(renderToStaticMarkup(<AutoriaNote authorName="" />)).toBe("")
    expect(renderToStaticMarkup(<AutoriaNote authorName="   " />)).toBe("")
  })

  it("nomeia a unidade responsavel", () => {
    const html = renderToStaticMarkup(<AutoriaNote authorName="Polo Betim" />)
    expect(html).toContain("Polo Betim")
    expect(html).toContain("Responsabilidade pelo conteúdo")
  })

  it("isenta as tres marcas, nominalmente", () => {
    // O pedido do dono cita as tres: a nota nao vale se deixar alguma de fora.
    const html = renderToStaticMarkup(<AutoriaNote authorName="Polo Betim" />)
    expect(html).toContain("Profissionaliza Mais Brasil")
    expect(html).toContain("Livre Cursos")
    expect(html).toContain("Grupo Bolsa Mais Brasil")
  })

  it("cobre conteudo E autoria/originalidade, nao so 'o material'", () => {
    const html = renderToStaticMarkup(<AutoriaNote authorName="Polo Betim" />)
    for (const termo of ["autoria", "originalidade", "direitos autorais"]) {
      expect(html.toLowerCase()).toContain(termo)
    }
  })

  it("nome com acento e caractere especial nao quebra a marcacao", () => {
    const html = renderToStaticMarkup(
      <AutoriaNote authorName="Educação & Cia <Ltda>" />,
    )
    // O React escapa; o que importa e que o texto chegue legivel e sem HTML solto.
    expect(html).toContain("Educação &amp; Cia &lt;Ltda&gt;")
    expect(html).not.toContain("<Ltda>")
  })
})
