/**
 * Configuracao do client da fornecedora de cursos propria (LMS).
 *
 * API M2M REST JSON em /api/v1, autenticada por `Authorization: Bearer <LMS_API_KEY>`.
 * Diferente da EA (form-data PHP em src/lib/plataforma-cursos), o LMS e ele
 * proprio uma camada que provisiona nos parceiros por baixo (PMB -> LMS -> EA).
 */
import { env } from "@/lib/env"
import { lmsPublicBaseUrl } from "./urls"

export function getLmsConfig(): { url: string; apiKey: string } {
  const url = lmsPublicBaseUrl()
  const apiKey = env.LMS_API_KEY
  if (!apiKey) {
    throw new Error("LMS_API_KEY environment variable is required")
  }
  return { url: url.replace(/\/$/, ""), apiKey }
}

/** True se as credenciais do LMS estao configuradas (sem lancar). */
export function isLmsConfigured(): boolean {
  return Boolean(env.LMS_API_KEY)
}
