import type { CertificateRenderFields } from "./generate-pdf"

/**
 * Dados fictícios usados nas prévias de certificado (PDF e HTML). Mantém o
 * preview consistente com `buildSampleData` do componente HTML compartilhado.
 * O `unidade` varia para refletir a escola que está visualizando.
 */
export function sampleCertificateFields(unidade: string): CertificateRenderFields {
  return {
    studentName: "Maria da Silva",
    studentCpf: "123.456.789-00",
    courseName: "Curso Exemplo Profissionalizante",
    cargaHoraria: "40h",
    completionDate: new Date(),
    code: "EXEMPLO-12345",
    unidade,
  }
}
