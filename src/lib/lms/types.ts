/**
 * Tipos da API do LMS (/api/v1). Datas em ISO-8601 (UTC).
 * Sucesso: { data: ... }. Erro: { error: "mensagem" } com status HTTP.
 */

// ── Catalogo ──────────────────────────────────────────────

/** Categoria da vitrine (N-N). `slug` e a chave estavel; `name` e a exibicao. */
export interface LmsCategory {
  id: string // UUID
  slug: string
  name: string
}

/**
 * Item da matriz curricular (grade) do curso. No PMB a matriz e uma lista de
 * topicos (string[]) — mapeamos cada item para o seu `title`, ordenado por `order`.
 */
export interface LmsCurriculumItem {
  id: string // UUID
  title: string
  workloadHours: number | null
  ementa: string | null
  order: number
}

export interface LmsCourse {
  id: string // UUID
  slug: string
  title: string
  description: string | null
  workload: string | null // ex: "12 horas"
  // Valor sugerido/de referencia em CENTAVOS (ex: 19700 = R$ 197,00). null = sem
  // sugestao. E so referencia — cobranca/comissao/financeiro seguem 100% no PMB.
  suggestedPriceCents: number | null
  // Categorias da vitrine (N-N, ordenadas por name). Pode vir [].
  categories: LmsCategory[]
  // Matriz curricular (grade). Opcional para tolerar respostas antigas sem o
  // campo — quando ausente, o sync NAO mexe na matriz existente. `[]` = sem matriz.
  curriculum?: LmsCurriculumItem[]
  totalWorkloadHours?: number | null
  // Unidade DONA do conteudo (`tenantExternalId`, o mesmo de PUT /tenants/:id).
  // Ausente/null = curso do catalogo da PMB — e o caso de todo o catalogo de
  // hoje. Opcional para tolerar a versao do LMS que ainda nao devolve o campo.
  ownerTenantExternalId?: string | null
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
  /**
   * Override das REGRAS PEDAGOGICAS desta matricula, ja resolvido aqui. Omitir
   * (ou `null`) faz a matricula HERDAR o padrao da unidade, que o LMS ja tem —
   * e o que permite a unidade editar o proprio padrao depois e alcancar as
   * matriculas antigas. Ver `pedagogyForNewEnrollment`.
   */
  pedagogy?: Record<string, unknown> | null
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
  /**
   * Identidade visual que a unidade definiu em /painel/vitrine → Personalizacao.
   * Hex (`#RGB`/`#RRGGBB`); `""` limpa e volta a paleta padrao da plataforma.
   * CAMPO AUSENTE preserva o que ja esta la — chamadas que nao conhecem as
   * cores nao podem apagar a personalizacao de quem ja a tem.
   */
  primaryColor?: string
  secondaryColor?: string
  /**
   * REGRAS PEDAGOGICAS padrao da unidade (`PedagogyPolicy` serializavel).
   * `null` limpa; campo AUSENTE preserva — as chamadas de branding nao
   * conhecem a politica e nao podem apaga-la, exatamente como as cores.
   */
  pedagogy?: Record<string, unknown> | null
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
  suggestedPriceCents: number | null
  categories: LmsCategory[]
  curriculum?: LmsCurriculumItem[]
  totalWorkloadHours?: number | null
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
