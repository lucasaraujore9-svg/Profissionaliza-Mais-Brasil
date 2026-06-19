/**
 * Configuracao do client da nova fornecedora de cursos (LMS lms.bmbr.com.br).
 *
 * API M2M REST JSON em /api/v1, autenticada por `Authorization: Bearer <LMS_API_KEY>`.
 * Diferente da EA (form-data PHP em src/lib/plataforma-cursos), o LMS e ele
 * proprio uma camada que provisiona nos parceiros por baixo (PMB -> LMS -> EA).
 */
export function getLmsConfig(): { url: string; apiKey: string } {
  const url = process.env.LMS_API_URL
  const apiKey = process.env.LMS_API_KEY
  if (!url || !apiKey) {
    throw new Error("LMS_API_URL and LMS_API_KEY environment variables are required")
  }
  return { url: url.replace(/\/$/, ""), apiKey }
}

/** True se as credenciais do LMS estao configuradas (sem lancar). */
export function isLmsConfigured(): boolean {
  return Boolean(process.env.LMS_API_URL && process.env.LMS_API_KEY)
}
