import type { ResolvedTemplate } from "../template-resolver"

/**
 * Dados de renderização COMPARTILHADOS por todos os templates de certificado
 * (classic/minimal/modern) e pela página de verso (info-page). Extraído para um
 * módulo folha (só tipos) para quebrar a dependência circular entre `classic`
 * (que importa funções de `info-page`) e `info-page` (que importava este tipo de
 * volta de `classic`) — COD-004.
 */
export interface CertificateRenderData {
  template: ResolvedTemplate
  studentName: string
  studentCpf?: string | null
  courseName: string
  cargaHoraria?: string | null
  /**
   * Matriz curricular do curso (conteúdo programático). Exibida no verso
   * (página 2). Vazia/ausente => o verso segue o layout atual, sem a seção.
   */
  matrizCurricular?: string[]
  completionDateFormatted: string
  code: string
  unidade: string
  /**
   * Percentual de conclusão do curso (0-100) sincronizado da plataforma.
   * Exibido no verso (página 2). `null` => assume 100% (certificado de conclusão).
   */
  progressPercent: number | null
  validationUrl: string
  qrCodeDataUrl: string | null
  /**
   * Texto do corpo ja com placeholders substituidos.
   */
  bodyResolved: string
  /**
   * Texto do rodape ja com placeholders substituidos (ou null).
   */
  footerResolved: string | null
  /**
   * Logo do Grupo Bolsa Mais Brasil — selo "powered by" em rodape.
   * Null = renderiza apenas o texto do `groupName`.
   */
  groupLogoUrl: string | null
  /**
   * Nome do grupo exibido junto ao selo de plataforma.
   * Default: "Grupo Bolsa Mais Brasil".
   */
  groupName: string
}
