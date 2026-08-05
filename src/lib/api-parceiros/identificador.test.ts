import { describe, it, expect } from "vitest"
import {
  adivinhar,
  normalizar,
  resolverDaQuery,
  candidatosDeDominio,
} from "./identificador"

// CPF válido de teste (passa nos dois dígitos verificadores).
const CPF_VALIDO = "529.982.247-25"
// Celular de SP: 11 dígitos, o MESMO comprimento de um CPF — é o caso que
// obriga a dedução a usar o dígito verificador.
const CELULAR = "11987654321"

describe("normalizar", () => {
  it("normaliza e-mail para minúsculas", () => {
    const r = normalizar("email", "  Joao@Exemplo.COM.br ")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.identificador.valor).toBe("joao@exemplo.com.br")
      expect(r.identificador.original).toBe("Joao@Exemplo.COM.br")
    }
  })

  it("recusa e-mail malformado", () => {
    expect(normalizar("email", "joao@").ok).toBe(false)
    expect(normalizar("email", "sem-arroba.com").ok).toBe(false)
  })

  it("aceita CPF com e sem máscara e devolve só dígitos", () => {
    for (const entrada of [CPF_VALIDO, "52998224725"]) {
      const r = normalizar("cpf", entrada)
      expect(r.ok).toBe(true)
      if (r.ok) expect(r.identificador.valor).toBe("52998224725")
    }
  })

  it("recusa CPF com dígito verificador errado antes de tocar o banco", () => {
    expect(normalizar("cpf", "529.982.247-24").ok).toBe(false)
    expect(normalizar("cpf", "111.111.111-11").ok).toBe(false)
  })

  it("normaliza telefone removendo o +55 e a máscara", () => {
    for (const entrada of ["+55 (11) 98765-4321", "11987654321", "5511987654321"]) {
      const r = normalizar("telefone", entrada)
      expect(r.ok, entrada).toBe(true)
      if (r.ok) expect(r.identificador.valor).toBe(CELULAR)
    }
  })

  it("extrai o host de uma URL completa no domínio", () => {
    const r = normalizar("dominio", "https://www.cursosdojoao.com.br/curso/x?a=1")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.identificador.valor).toBe("www.cursosdojoao.com.br")
  })

  it("recusa slug com caractere fora do permitido", () => {
    expect(normalizar("slug", "cursos do joao").ok).toBe(false)
    expect(normalizar("slug", "cursos-do-joao").ok).toBe(true)
  })

  it("coloca o código de indicação em maiúsculas", () => {
    const r = normalizar("codigo", "joao2026")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.identificador.valor).toBe("JOAO2026")
  })
})

describe("adivinhar", () => {
  it("reconhece e-mail pelo @", () => {
    const r = adivinhar("joao@exemplo.com.br")
    expect(r.ok && r.identificador.tipo).toBe("email")
  })

  it("distingue CPF de celular pelo dígito verificador (ambos 11 dígitos)", () => {
    const cpf = adivinhar("52998224725")
    expect(cpf.ok && cpf.identificador.tipo).toBe("cpf")

    const fone = adivinhar(CELULAR)
    expect(fone.ok && fone.identificador.tipo).toBe("telefone")
  })

  it("reconhece CPF e telefone mascarados", () => {
    const cpf = adivinhar(CPF_VALIDO)
    expect(cpf.ok && cpf.identificador.tipo).toBe("cpf")
    const fone = adivinhar("(11) 98765-4321")
    expect(fone.ok && fone.identificador.tipo).toBe("telefone")
  })

  it("reconhece domínio por conter ponto ou barra", () => {
    for (const entrada of [
      "cursosdojoao.com.br",
      "https://cursosdojoao.com.br",
      "www.cursosdojoao.com.br/curso",
    ]) {
      const r = adivinhar(entrada)
      expect(r.ok && r.identificador.tipo, entrada).toBe("dominio")
    }
  })

  it("cai em slug quando não é nenhum dos anteriores", () => {
    const r = adivinhar("cursos-do-joao")
    expect(r.ok && r.identificador.tipo).toBe("slug")
  })

  /**
   * Slug, id (cuid) e código de indicação são indistinguíveis pela forma. Sem
   * carregar as alternativas, um cuid ou um código válido passado em `?q=`
   * viraria 404 — a busca sairia procurando só por slug.
   */
  it("carrega id como alternativa quando o valor tem forma de cuid", () => {
    const r = adivinhar("clg8x2k9p0001abcdefghijk")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.identificador.tipo).toBe("slug")
    expect(r.identificador.alternativas).toEqual(
      expect.arrayContaining([
        { tipo: "id", valor: "clg8x2k9p0001abcdefghijk" },
      ]),
    )
  })

  it("carrega código de indicação como alternativa e o normaliza em maiúsculas", () => {
    const r = adivinhar("joao2026")
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.identificador.tipo).toBe("slug")
    expect(r.identificador.alternativas).toEqual(
      expect.arrayContaining([{ tipo: "codigo", valor: "JOAO2026" }]),
    )
  })

  it("campo NOMEADO não ganha alternativas — o tipo é contrato, não palpite", () => {
    const r = normalizar("slug", "joao2026")
    expect(r.ok && r.identificador.alternativas).toBeUndefined()
  })

  it("recusa sequência numérica que não é CPF nem telefone", () => {
    expect(adivinhar("00000000000").ok).toBe(false)
  })

  it("recusa valor vazio", () => {
    const r = adivinhar("   ")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe("ausente")
  })
})

describe("resolverDaQuery", () => {
  it("resolve o campo nomeado", () => {
    const r = resolverDaQuery(new URLSearchParams("email=joao@exemplo.com.br"))
    expect(r.ok && r.identificador.tipo).toBe("email")
  })

  it("exige algum identificador", () => {
    const r = resolverDaQuery(new URLSearchParams(""))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe("ausente")
  })

  /**
   * Recusar (em vez de eleger um) é deliberado: se os dois campos apontam para
   * unidades diferentes, qualquer escolha nossa seria silenciosamente errada
   * para o parceiro.
   */
  it("recusa dois identificadores na mesma requisição", () => {
    const r = resolverDaQuery(
      new URLSearchParams("email=joao@exemplo.com.br&slug=outra-loja"),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe("ambiguo")
  })

  it("recusa campo nomeado junto com q", () => {
    const r = resolverDaQuery(new URLSearchParams("slug=loja&q=outra"))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.motivo).toBe("ambiguo")
  })

  it("aceita q sozinho", () => {
    const r = resolverDaQuery(new URLSearchParams("q=cursos-do-joao"))
    expect(r.ok && r.identificador.tipo).toBe("slug")
  })

  it("ignora parâmetro vazio", () => {
    const r = resolverDaQuery(new URLSearchParams("cpf=&slug=cursos-do-joao"))
    expect(r.ok && r.identificador.tipo).toBe("slug")
  })
})

describe("candidatosDeDominio", () => {
  it("cobre apex e www a partir de qualquer das duas formas", () => {
    expect(candidatosDeDominio("cursosdojoao.com.br")).toEqual(
      expect.arrayContaining(["cursosdojoao.com.br", "www.cursosdojoao.com.br"]),
    )
    expect(candidatosDeDominio("www.cursosdojoao.com.br")).toEqual(
      expect.arrayContaining(["cursosdojoao.com.br", "www.cursosdojoao.com.br"]),
    )
  })
})
