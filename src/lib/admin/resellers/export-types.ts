/**
 * Contrato da planilha de revendedores — PURO, sem Prisma.
 *
 * O botão de export é um componente de cliente e importa estes tipos; encostar
 * no Prisma daqui arrastaria o driver `pg` para o bundle do navegador e quebra
 * o build com "Can't resolve 'dns'" (mesma fronteira de `tenant-billing/types`).
 *
 * O servidor decide TUDO: quais abas existem, quais colunas cada uma tem, o tipo
 * de cada coluna e os valores já recortados pela permissão de quem pediu. O
 * cliente só transforma isso num arquivo .xlsx — ele não sabe o que é um tenant.
 */

/**
 * Como a célula é escrita no Excel. Não é decoração: `money`/`date`/`number`
 * viram valor NATIVO da planilha, então o operador consegue somar uma coluna de
 * valores e ordenar por vencimento. Gravar tudo como texto (o atalho óbvio)
 * produz uma planilha onde "10/02" vem antes de "09/03".
 */
export type ExportColumnKind =
  | "text"
  | "number"
  | "money"
  | "date"
  | "datetime"
  /** URL: vira hyperlink clicável, com o texto encurtado. */
  | "link"

export interface ExportColumn {
  header: string
  kind: ExportColumnKind
  width?: number
}

/** `null` = célula vazia. Datas viajam como ISO 8601 (JSON não tem Date). */
export type ExportCell = string | number | null

export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: ExportCell[][]
  /** Aviso exibido acima da planilha (ex.: corte por limite de linhas). */
  note?: string | null
}

export interface ResellerExportPayload {
  filename: string
  generatedAt: string
  /** Resumo dos filtros aplicados, para o cabeçalho do arquivo. */
  filtersLabel: string
  sheets: ExportSheet[]
}

/**
 * Excel limita o nome da aba a 31 caracteres e proíbe `: \ / ? * [ ]`.
 * Um nome inválido faz o arquivo abrir corrompido — silenciosamente, só na
 * máquina de quem baixou.
 */
export function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha"
}
