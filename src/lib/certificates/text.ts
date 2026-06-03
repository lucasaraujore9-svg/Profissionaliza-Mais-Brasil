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
