/**
 * Percentual minimo padrao de progresso para considerar um curso concluido
 * (mesma semantica de SystemSettings.certificateMinPercent).
 */
export const DEFAULT_CERTIFICATE_MIN_PERCENT = 80

/**
 * Decide se uma matricula esta "concluida" para fins de emissao de
 * certificado, considerando o progresso sincronizado da plataforma de aulas —
 * e nao apenas `Enrollment.status === "COMPLETED"`.
 *
 * O `status` da matricula nem sempre acompanha o progresso: o sync de
 * progresso atualiza `progressPercent`/`progressStatus`, mas o status so e
 * promovido para COMPLETED quando um certificado e efetivamente emitido. Por
 * isso um aluno com 100% de progresso pode continuar ACTIVE/SUSPENDED e, antes
 * desta regra, ficava travado na emissao manual ("Matricula nao esta marcada
 * como concluida").
 *
 * Esta funcao e pura (sem dependencias de servidor) e e usada tanto no backend
 * (`issueCertificateManual`) quanto na UI (`CertificateIssueForm`) para que as
 * duas camadas concordem sobre o que significa "concluido".
 */
export function isEnrollmentConcludedForCertificate(
  input: {
    status?: string | null
    progressStatus?: string | null
    progressPercent?: number | null
  },
  minPercent: number = DEFAULT_CERTIFICATE_MIN_PERCENT,
): boolean {
  if (input.status === "COMPLETED") return true
  if (input.progressStatus === "CONCLUIDO") return true
  return (input.progressPercent ?? 0) >= minPercent
}
