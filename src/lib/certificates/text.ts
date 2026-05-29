/**
 * Normaliza um valor exibido no certificado para minusculo.
 *
 * Regra de negocio: os nomes e parametros do certificado (nome do aluno, curso,
 * CPF, carga horaria, data, codigo de validacao, unidade) sao sempre exibidos em
 * minusculo — tanto no PDF quanto nas telas (area do aluno e validacao publica).
 *
 * O codigo de validacao continua armazenado em maiusculo no banco; a rota
 * /validar normaliza a entrada com toUpperCase(), entao exibi-lo em minusculo
 * nao quebra a validacao.
 */
export function lowerCert(value: string | null | undefined): string {
  return (value ?? "").toLowerCase()
}
