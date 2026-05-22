/**
 * Substituicao de placeholders nos textos do template de certificado.
 * Placeholders suportados:
 *   {nome}            — nome do aluno
 *   {cpf}             — CPF do aluno (vazio se ausente)
 *   {curso}           — nome do curso
 *   {carga_horaria}   — carga horaria do curso (ex: "40h")
 *   {data_conclusao}  — data de conclusao formatada (ex: "21/05/2026")
 *   {codigo}          — codigo de validacao do certificado
 *   {unidade}         — nome do tenant emissor (ou "Profissionaliza Mais Brasil")
 */

export interface CertificatePlaceholders {
  nome: string
  cpf?: string | null
  curso: string
  carga_horaria?: string | null
  data_conclusao: string
  codigo: string
  unidade: string
}

const PLACEHOLDER_RE = /\{(nome|cpf|curso|carga_horaria|data_conclusao|codigo|unidade)\}/g

export function applyPlaceholders(
  text: string,
  values: CertificatePlaceholders,
): string {
  return text.replace(PLACEHOLDER_RE, (_, key: keyof CertificatePlaceholders) => {
    const v = values[key]
    if (v === undefined || v === null) return ""
    return String(v)
  })
}

export function formatCompletionDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}
