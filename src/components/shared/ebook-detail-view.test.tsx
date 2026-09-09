import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { EbookDetailView, type EbookDetailData } from "./ebook-detail-view"
import { CourseDetailView, type CourseDetailData } from "./course-detail-view"

/*
 * A PÁGINA DE VENDA DO E-BOOK.
 *
 * O que não pode regredir é o que ela NÃO promete. A página do curso anuncia, em
 * oito lugares, "N aulas em vídeo", "carga horária", "certificado reconhecido
 * nacionalmente" e "conclua todas as aulas" — vender um e-book com esse texto é
 * a mentira mais cara possível, porque a pessoa só descobre depois de pagar.
 *
 * Os testes olham o HTML renderizado (e não a árvore de componentes) de
 * propósito: é isso que o comprador lê.
 */

const EBOOK: EbookDetailData = {
  slug: "guia-do-eletricista",
  nome: "Guia Prático do Eletricista",
  categoria: "Construção e Reformas",
  descricao: "Tabelas, fórmulas e checagens do dia a dia da obra.",
  imageUrl: null,
  price: 47,
  originalPrice: 97,
  parcelas: 3,
  paginas: 84,
  tempoLeitura: "2 horas",
  baixavel: true,
  sumario: ["Ferramentas essenciais", "Dimensionamento de cabos"],
  aprendizado: ["Ler um projeto elétrico"],
  authorName: null,
}

function html(over: Partial<EbookDetailData> = {}) {
  return renderToStaticMarkup(
    <EbookDetailView ebook={{ ...EBOOK, ...over }} ctaHref="/checkout?course_id=x" backHref="/cursos" />,
  )
}

describe("EbookDetailView — o que ela NÃO promete", () => {
  it("não fala em certificado como algo incluso", () => {
    const out = html()
    expect(out).not.toContain("Certificado reconhecido")
    expect(out).not.toContain("Certificado incluso")
    expect(out).not.toContain("reconhecido nacionalmente")
  })

  /* As duas únicas menções a "aulas em vídeo" e "carga horária" na página são
     NEGAÇÕES ("não inclui aulas em vídeo…", "os cursos, que têm aulas, carga
     horária…"). Por isso o teste procura as AFIRMAÇÕES do curso, não as
     palavras: proibir a palavra proibiria também a frase que existe justamente
     para deixar claro o que o produto não é. */
  it("não anuncia aulas nem seções do curso como se fossem deste produto", () => {
    const out = html()
    expect(out).not.toContain("Sobre o curso")
    expect(out).not.toContain("Conteúdo do curso")
    expect(out).not.toContain("de conteúdo</li>")
    expect(out).not.toContain("Matriz curricular")
    expect(out).not.toContain("Para quem é este curso")
    expect(out).not.toContain("Ao concluir todas as aulas")
    // Toda ocorrência de "aulas em vídeo" tem que estar na frase que NEGA.
    for (const trecho of out.split("aulas em vídeo").slice(0, -1)) {
      expect(trecho.endsWith("não inclui ")).toBe(true)
    }
  })

  /* A nota de regulamentação declara que o produto é um CURSO LIVRE regulamentado
     pela Lei nº 9.394/96. Um e-book não é — imprimi-la aqui seria afirmação legal
     falsa, e é por isso que ela não é renderizada (e não porque "não coube"). */
  it("não imprime a nota de regulamentação dos cursos livres", () => {
    const out = html()
    expect(out).not.toContain("9.394")
    expect(out).not.toContain("cursos livres")
  })

  /* Quem chega de uma vitrine cheia de curso supõe aulas e certificado.
     Descobrir isso depois de pagar é o motivo nº 1 de pedido de reembolso em
     produto digital, então a página diz com todas as letras. */
  it("diz explicitamente que não inclui aulas, prova nem certificado", () => {
    expect(html()).toContain("não inclui aulas em vídeo, prova")
  })
})

describe("EbookDetailView — o que ela promete", () => {
  it("anuncia páginas, acesso imediato e leitura em qualquer aparelho", () => {
    const out = html()
    expect(out).toContain("84 páginas")
    expect(out).toContain("Acesso imediato")
    expect(out).toContain("Leia no celular ou no computador")
  })

  it("promete download só quando o autor liberou", () => {
    expect(html({ baixavel: true })).toContain("Baixe o PDF e leia sem internet")
    const semDownload = html({ baixavel: false })
    expect(semDownload).not.toContain("Baixe o PDF")
    expect(semDownload).toContain("Leitura pela plataforma")
  })

  it("sem páginas informadas, não anuncia '0 páginas'", () => {
    const out = html({ paginas: null })
    expect(out).not.toContain("0 páginas")
    expect(out).toContain("Material em PDF")
  })

  /* O sumário reusa `Course.matrizCurricular`, que num curso é a matriz
     curricular. Aqui ele é o índice do livro — e some quando está vazio, em vez
     de deixar um título de seção sobre nada. */
  it("mostra o sumário quando existe e some quando não existe", () => {
    expect(html()).toContain("O que tem dentro")
    expect(html({ sumario: [] })).not.toContain("O que tem dentro")
  })

  it("a nota de autoria fala em e-book, e só aparece com autor", () => {
    expect(html()).not.toContain("Responsabilidade pelo conteúdo")
    const comAutor = html({ authorName: "Escola Alfa" })
    expect(comAutor).toContain("Responsabilidade pelo conteúdo")
    expect(comAutor).toContain("Este e-book é produzido e mantido por")
    // Enumerar "aulas, exercícios e avaliações" descreveria outro produto.
    expect(comAutor).not.toContain("exercícios e avaliações")
  })
})

describe("o bloco de dinheiro é o MESMO nas duas páginas", () => {
  /* Preço, "De R$", parcelamento e o selo de desconto saem de `offer-panel`,
     compartilhado. Duas cópias divergiriam justamente na tela em que a pessoa
     decide pagar — por isso o teste compara as duas saídas em vez de conferir só
     uma delas. */
  const CURSO: CourseDetailData = {
    slug: "eletricista",
    nome: "Eletricista Residencial",
    categoria: "Construção e Reformas",
    descricao: "…",
    qtdAulas: 12,
    cargaHoraria: "40",
    imageUrl: null,
    price: 47,
    originalPrice: 97,
    parcelas: 3,
    lessons: [],
  }

  it("mostra o mesmo preço, o mesmo 'De' e o mesmo parcelamento", () => {
    const curso = renderToStaticMarkup(
      <CourseDetailView course={CURSO} ctaHref="/x" backHref="/cursos" />,
    )
    const ebook = html()
    for (const trecho of ["R$ 47,00", "De R$ 97,00", "3x de R$ 15,67 sem juros", "52% OFF"]) {
      expect(curso).toContain(trecho)
      expect(ebook).toContain(trecho)
    }
  })
})
