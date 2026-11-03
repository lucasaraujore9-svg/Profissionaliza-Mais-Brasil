/**
 * Normaliza um valor exibido no certificado para MAIUSCULO.
 *
 * Regra de negocio: os nomes e parametros do certificado (nome do aluno, curso,
 * CPF, carga horaria, data, codigo de validacao, unidade) sao sempre exibidos em
 * maiusculo — tanto no PDF quanto nas telas (area do aluno e validacao publica).
 *
 * A URL de validacao (link/QR) permanece em minusculo via `lowerCert`, pois e um
 * endereco web. O codigo de validacao e armazenado em maiusculo no banco e a rota
 * /validar normaliza a entrada com toUpperCase(), entao a validacao nao quebra.
 */
export function upperCert(value: string | null | undefined): string {
  return (value ?? "").toUpperCase()
}

/**
 * Normaliza para minusculo. Mantido para a URL de validacao (link e QR code),
 * que deve permanecer em minusculo por ser um endereco web.
 */
export function lowerCert(value: string | null | undefined): string {
  return (value ?? "").toLowerCase()
}

// Caracteres que a codificacao WinAnsi (cp1252) tem na faixa 0x80-0x9F.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"

function winAnsiEncodable(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return c < 0x80 || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)
}

/**
 * Adapta texto para as fontes padrao do PDF (Helvetica), que so codificam
 * WinAnsi: qualquer letra fora dela SOME do documento em silencio. Foi o caso
 * de "Vircėlia" (ė, U+0117), impresso como "VIRCLIA". Letra acentuada fora do
 * conjunto perde o acento ("ė" -> "e") em vez de sumir; o que ja e WinAnsi
 * (á, ç, ã, é...) fica intacto. Vale so para o PDF — as telas usam fonte do
 * navegador, que tem o glifo.
 */
export function pdfSafeText(value: string): string {
  return Array.from(value, (ch) =>
    winAnsiEncodable(ch) ? ch : ch.normalize("NFD").replace(/\p{M}/gu, ""),
  ).join("")
}
