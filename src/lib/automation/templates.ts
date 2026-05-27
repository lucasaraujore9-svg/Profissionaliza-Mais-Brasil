export interface TemplateVars {
  aluno_nome: string
  curso: string
  escola: string
  link_curso?: string
  valor?: string
}

/**
 * Interpolacao simples de placeholders no formato {{key}}. Faltas viram
 * string vazia (nao quebra o envio).
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  const lookup = vars as unknown as Record<string, string | undefined>
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_, key: string) => {
    const v = lookup[key]
    return typeof v === "string" ? v : ""
  })
}
