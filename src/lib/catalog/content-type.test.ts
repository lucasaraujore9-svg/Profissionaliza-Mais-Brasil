import { describe, it, expect } from "vitest"
import {
  isEbook,
  contentLabel,
  contentAccessLabel,
  contentCardMeta,
  canIssueCertificate,
  isPaceGateApplicable,
} from "./content-type"

describe("isEbook", () => {
  it("só é verdadeiro para EBOOK", () => {
    expect(isEbook({ contentType: "EBOOK" })).toBe(true)
    expect(isEbook({ contentType: "COURSE" })).toBe(false)
  })

  /* `undefined` é o que chega de um `select` que não pediu a coluna, e de toda
     linha anterior à migration. Tem que ser CURSO — o default do banco e o
     comportamento que sempre existiu. */
  it("ausente e nulo contam como curso", () => {
    expect(isEbook({})).toBe(false)
    expect(isEbook({ contentType: null })).toBe(false)
    expect(isEbook(null)).toBe(false)
    expect(isEbook(undefined)).toBe(false)
  })
})

describe("vocabulário", () => {
  it("nomeia cada tipo pelo que ele é", () => {
    expect(contentLabel("EBOOK")).toBe("E-book")
    expect(contentLabel("COURSE")).toBe("Curso")
    expect(contentLabel(undefined)).toBe("Curso")
  })

  /* "Acessar aulas" num e-book prometeria uma tela que não existe. */
  it("o CTA de quem já comprou diz o que vai acontecer", () => {
    expect(contentAccessLabel("EBOOK")).toBe("Ler e-book")
    expect(contentAccessLabel("COURSE")).toBe("Acessar aulas")
  })
})

describe("contentCardMeta", () => {
  it("curso: carga horária, com as aulas de reserva", () => {
    expect(contentCardMeta({ contentType: "COURSE", cargaHoraria: "40", qtdAulas: 12 })).toBe("40h")
    expect(contentCardMeta({ contentType: "COURSE", cargaHoraria: null, qtdAulas: 12 })).toBe("12 aulas")
  })

  /* Um card de e-book anunciando "0 aulas" é o defeito que se paga por deixar
     cada um dos três mapeadores montar a própria linha. */
  it("e-book: páginas, nunca aulas", () => {
    expect(contentCardMeta({ contentType: "EBOOK", ebookPages: 84, qtdAulas: 0 })).toBe("84 páginas")
    expect(contentCardMeta({ contentType: "EBOOK", ebookPages: 1 })).toBe("1 página")
  })

  it("e-book sem páginas cai no tempo de leitura, e depois no rótulo", () => {
    expect(contentCardMeta({ contentType: "EBOOK", cargaHoraria: "2 horas" })).toBe("2 horas de leitura")
    expect(contentCardMeta({ contentType: "EBOOK" })).toBe("E-book")
  })

  /* No e-book `cargaHoraria` guarda o texto inteiro ("2 horas"); no curso, só o
     número. Concatenar "h" nos dois produzia "2 horash". */
  it("não gruda 'h' no tempo de leitura do e-book", () => {
    expect(contentCardMeta({ contentType: "EBOOK", cargaHoraria: "2 horas" })).not.toContain("horash")
  })
})

describe("canIssueCertificate", () => {
  /* Certificado é documento de curso livre: declara carga horária e conclusão
     apurada. Num e-book a "conclusão" é o leitor dizendo que terminou — emitir
     seria atestar um aproveitamento que ninguém mediu. */
  it("e-book não certifica; curso certifica", () => {
    expect(canIssueCertificate({ contentType: "EBOOK" })).toBe(false)
    expect(canIssueCertificate({ contentType: "COURSE" })).toBe(true)
    expect(canIssueCertificate({})).toBe(true)
  })
})

describe("isPaceGateApplicable", () => {
  /* A cota compara fração paga com fração de AULAS assistidas. O progresso de um
     e-book só assume 0 ou 100: quem marcasse "li" seria travado no ato. */
  it("a cota de aulas não alcança e-book", () => {
    expect(isPaceGateApplicable({ contentType: "EBOOK" })).toBe(false)
    expect(isPaceGateApplicable({ contentType: "COURSE" })).toBe(true)
    expect(isPaceGateApplicable({})).toBe(true)
  })
})
