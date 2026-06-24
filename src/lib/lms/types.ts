/**
 * Tipos da API do LMS (lms.bmbr.com.br/api/v1). Datas em ISO-8601 (UTC).
 * Sucesso: { data: ... }. Erro: { error: "mensagem" } com status HTTP.
 */

// ── Catalogo ──────────────────────────────────────────────

export interface LmsCourse {
  id: string // UUID
  slug: string
  title: string
  description: string | null
  workload: string | null // ex: "12 horas"
  version: number
  publishedAt: string
  moduleCount: number
  lessonCount: number
  durationSec: number
  materialCount: number
}

export interface LmsLesson {
  id: string
  title: string
  order: number
  durationSec: number
  freePreview: boolean
  materialCount: number
}

export interface LmsModule {
  id: string
  title: string
  order: number
  lessons: LmsLesson[]
}

export interface LmsCourseDetail extends LmsCourse {
  coverColor: string | null
  coverImage: string | null
  minPercent: number | null
  freePreviewLessonId: string | null
  modules: LmsModule[]
}

// ── Matricula ─────────────────────────────────────────────

export interface LmsEnrollmentRequest {
  studentExternalId: string
  student: { name: string; email: string }
  courseId: string
  tenantExternalId?: string
}

/**
 * Acesso a plataforma de destino (curso proprio do LMS ou parceiro). A senha
 * vem em CLARO no payload M2M autenticado; o PMB persiste CIFRADA. Presente so
 * para curso de parceiro (playback "redirect") e curso proprio do LMS.
 */
export interface LmsPartnerAccess {
  login: string
  password: string
  portalUrl: string
}

export interface LmsEnrollmentResponse {
  enrollmentId: string
  studentId: string
  courseId: string
  origin: string // "own" | chave do parceiro (ex: "escola-avancada")
  playback: string // "local" | "redirect"
  provisioning: { target?: string; ok: boolean; message?: string }
  partnerAccess?: LmsPartnerAccess | null
}

/** Branding white-label da revenda (PUT /api/v1/tenants/:id). */
export interface LmsTenantBrandingRequest {
  brandName?: string
  logoUrl?: string | null
  certificateBaseUrl?: string
}

// ── Acesso / aluno ────────────────────────────────────────

export type LmsAccessStatus = "active" | "blocked"

export interface LmsStudentCourse {
  courseId: string
  slug: string
  title: string
  origin?: string
  enrollmentStatus?: string
  grantedAt?: string | null
  revokedAt?: string | null
  percent?: number
  status: string // "in_progress" | "completed" | ...
  completedAt?: string | null
  lastActivityAt?: string | null
  access?: LmsPartnerAccess | null // credencial por curso (re-busca/reparo)
}

export interface LmsStudentProfile {
  studentId: string
  externalId: string | null
  tenantExternalId?: string | null
  name: string
  email: string
  status: LmsAccessStatus
  courses: LmsStudentCourse[]
}

export interface LmsSsoTokenRequest {
  studentExternalId: string
  tenantExternalId?: string
  returnUrl?: string
}

export interface LmsSsoTokenResponse {
  url: string
}

// ── Delta diario (day-update) ─────────────────────────────

export interface LmsDayCourse {
  id: string
  slug: string
  title: string
  description: string | null
  workload: string | null
  version: number
  status: string // "published" | ...
  visible: boolean
  publishedAt: string
  updatedAt: string
  moduleCount: number
  lessonCount: number
  durationSec: number
  materialCount: number
}

export interface LmsDayStudentCourse {
  courseId: string
  slug: string
  title: string
  percent: number
  status: string // "in_progress" | "completed" | ...
  completedAt: string | null
  lastActivityAt: string | null
  enrollmentStatus: string
  grantedAt: string | null
  revokedAt: string | null
}

export interface LmsDayStudent {
  studentExternalId: string | null
  tenantExternalId: string | null
  name: string
  email?: string
  status: LmsAccessStatus
  courses: LmsDayStudentCourse[]
}

export interface LmsDayUpdateResponse {
  data: {
    courses: LmsDayCourse[]
    students: LmsDayStudent[]
  }
  since: string | null
  generatedAt: string
  counts: { courses: number; students: number }
}
