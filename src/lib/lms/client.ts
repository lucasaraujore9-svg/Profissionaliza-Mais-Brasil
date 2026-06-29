import { getLmsConfig } from "./config"
import { LmsApiError, LmsNetworkError } from "./errors"
import type {
  LmsCourse,
  LmsCourseDetail,
  LmsEnrollmentRequest,
  LmsEnrollmentResponse,
  LmsAccessStatus,
  LmsStudentProfile,
  LmsSsoTokenRequest,
  LmsSsoTokenResponse,
  LmsDayUpdateResponse,
  LmsTenantBrandingRequest,
} from "./types"
import { contextLogger } from "@/lib/logger"
import { normalizeLmsPublicUrl } from "./urls"

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 500
const TIMEOUT_MS = 25_000

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface LmsRequestOptions {
  body?: unknown
  idempotencyKey?: string
  query?: Record<string, string | undefined>
}

/**
 * Faz a chamada HTTP ao LMS com retry/backoff. Retorna o corpo JSON parseado
 * (envelope inteiro — `{ data, ... }` ou flat). Retry so em 5xx/rede; 4xx e
 * erro de negocio sao lancados de imediato.
 */
async function lmsRequest<T>(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  opts: LmsRequestOptions = {},
): Promise<T> {
  const { url, apiKey } = getLmsConfig()

  const qs = opts.query
    ? Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
        .join("&")
    : ""
  const fullUrl = `${url}/api/v1${path}${qs ? `?${qs}` : ""}`

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  }
  if (opts.body !== undefined) headers["Content-Type"] = "application/json"
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(fullUrl, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })

      if (!res.ok) {
        // Tenta extrair { error } do corpo para mensagem util.
        let apiError: string | undefined
        try {
          const errBody = (await res.json()) as { error?: string }
          apiError = errBody?.error
        } catch {
          // corpo nao-JSON; segue so com status
        }
        throw new LmsApiError(
          `HTTP ${res.status}: ${apiError ?? res.statusText}`,
          path,
          res.status,
          apiError,
        )
      }

      // 200/201 sem corpo (ex: alguns revoke) — devolve objeto vazio.
      const text = await res.text()
      return (text ? JSON.parse(text) : {}) as T
    } catch (error) {
      if (error instanceof LmsApiError) {
        // 4xx = erro de negocio (validacao, nao encontrado): nao retenta.
        if (error.statusCode && error.statusCode < 500) throw error
      }

      if (attempt === MAX_RETRIES) {
        if (error instanceof LmsApiError) throw error
        throw new LmsNetworkError(
          `Failed after ${MAX_RETRIES + 1} attempts: ${method} ${path}`,
          path,
          error,
        )
      }

      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      if (process.env.NODE_ENV === "development") {
        contextLogger().warn(
          { event: "lms.client.retry", path, attempt: attempt + 1, maxRetries: MAX_RETRIES, backoffMs: backoff },
          "lms retry",
        )
      }
      await sleep(backoff)
    }
  }

  throw new LmsNetworkError("Unexpected retry exhaustion", path)
}

// ══════════════════════════════════════════════
// CATALOGO
// ══════════════════════════════════════════════

export async function listLmsCourses(): Promise<LmsCourse[]> {
  const res = await lmsRequest<{ data: LmsCourse[] }>("GET", "/courses")
  return res.data
}

export async function getLmsCourse(slug: string): Promise<LmsCourseDetail> {
  const res = await lmsRequest<{ data: LmsCourseDetail }>(
    "GET",
    `/courses/${encodeURIComponent(slug)}`,
  )
  return res.data
}

// ══════════════════════════════════════════════
// MATRICULA / ACESSO
// ══════════════════════════════════════════════

/**
 * Cria a matricula no LMS (que provisiona no parceiro por baixo). Idempotente
 * via Idempotency-Key. Mesmo com falha no parceiro retorna 201 com
 * provisioning.ok=false — o caller decide o que fazer.
 */
export async function createLmsEnrollment(
  body: LmsEnrollmentRequest,
  idempotencyKey: string,
): Promise<LmsEnrollmentResponse> {
  const res = await lmsRequest<{ data: LmsEnrollmentResponse }>(
    "POST",
    "/enrollments",
    { body, idempotencyKey },
  )
  return {
    ...res.data,
    partnerAccess: res.data.partnerAccess
      ? {
          ...res.data.partnerAccess,
          portalUrl: normalizeLmsPublicUrl(res.data.partnerAccess.portalUrl) ?? "",
        }
      : res.data.partnerAccess,
  }
}

/** Revoga o acesso a UM curso (idempotente no LMS). */
export async function revokeLmsEnrollment(enrollmentId: string): Promise<void> {
  await lmsRequest<{ data: unknown }>(
    "POST",
    `/enrollments/${encodeURIComponent(enrollmentId)}/revoke`,
  )
}

/**
 * Bloqueia/reativa o aluno e propaga aos parceiros. `studentRef` aceita o id
 * interno do LMS OU o externalId (nosso Student.id).
 */
export async function setLmsStudentAccess(
  studentRef: string,
  status: LmsAccessStatus,
): Promise<void> {
  await lmsRequest<{ data: unknown }>(
    "PATCH",
    `/students/${encodeURIComponent(studentRef)}/access`,
    { body: { status } },
  )
}

export async function getLmsStudent(studentRef: string): Promise<LmsStudentProfile> {
  const res = await lmsRequest<{ data: LmsStudentProfile }>(
    "GET",
    `/students/${encodeURIComponent(studentRef)}`,
  )
  return {
    ...res.data,
    courses: res.data.courses.map((course) => ({
      ...course,
      access: course.access
        ? {
            ...course.access,
            portalUrl: normalizeLmsPublicUrl(course.access.portalUrl) ?? "",
          }
        : course.access,
    })),
  }
}

/**
 * Emite link SSO de uso unico (TTL ~5 min) para o aluno entrar no player.
 * O aluno precisa estar matriculado antes. Resposta e flat: { url }.
 */
export async function createLmsSsoToken(
  body: LmsSsoTokenRequest,
): Promise<LmsSsoTokenResponse> {
  const res = await lmsRequest<LmsSsoTokenResponse>("POST", "/sso/token", { body })
  return { ...res, url: normalizeLmsPublicUrl(res.url) ?? res.url }
}

// ══════════════════════════════════════════════
// BRANDING (white-label por revenda)
// ══════════════════════════════════════════════

/**
 * Registra/atualiza o branding da revenda no LMS (PUT /tenants/:id). `:id` e o
 * tenantExternalId = Tenant.id (mesma chave enviada nas matriculas/SSO). Sem
 * isto, o aluno da revenda ve a marca PMB (fallback). NAO chamar para a vitrine
 * PMB (`__pmb__`). Os callers devem proteger com isLmsConfigured().
 */
export async function putLmsTenantBranding(
  tenantExternalId: string,
  body: LmsTenantBrandingRequest,
): Promise<void> {
  await lmsRequest<{ data: unknown }>(
    "PUT",
    `/tenants/${encodeURIComponent(tenantExternalId)}`,
    { body },
  )
}

// ══════════════════════════════════════════════
// SINCRONIZACAO (delta)
// ══════════════════════════════════════════════

/**
 * Sincronizacao incremental: retorna so o que mudou desde `since` (cursos +
 * alunos). Sem `since` faz export completo (util na 1a carga).
 */
export async function lmsDayUpdate(since?: string): Promise<LmsDayUpdateResponse> {
  return lmsRequest<LmsDayUpdateResponse>("GET", "/day-update", {
    query: { since },
  })
}
