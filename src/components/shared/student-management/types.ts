/**
 * Tipos compartilhados entre /admin/alunos/[id] e /painel/alunos/[id].
 * Mesmo shape de dados, mesmo client component, endpoints diferentes
 * via prop `scope`.
 */
export interface StudentEnrollmentItem {
  id: string
  courseName: string
  status: string
  paymentType: string
  gateway: string
  finalAmount: number
  installmentsTotal: number | null
  installmentsPaid: number
  asaasInvoiceUrl: string | null
  /**
   * Link de checkout para recuperar uma cobranca PENDENTE (venda direta ou
   * carrinho abandonado). `null` quando a matricula nao esta pendente ou nao
   * ha link disponivel.
   */
  checkoutUrl: string | null
  startedAt: string | null
  createdAt: string
}

export interface StudentPaymentItem {
  id: string
  amount: number
  status: string
  paidAt: string | null
  courseName: string
  createdAt: string
}

export interface StudentNoteItem {
  id: string
  body: string
  createdAt: string
  authorName: string
  authorId: string
}

/**
 * Credencial de acesso a plataforma do LMS por curso (curso proprio do LMS ou
 * parceiro). Espelha plataformaSenha (EA), mas e POR MATRICULA — origin/playback
 * variam por curso.
 */
export interface StudentLmsCredentialItem {
  enrollmentId: string
  courseName: string
  /** "own" (curso proprio do LMS) | chave do parceiro. */
  origin: string | null
  /** "local" (SSO no player do LMS) | "redirect" (assiste no parceiro). */
  playback: string | null
  login: string
  /** Senha descriptografada; `null` quando ausente/corrompida (só o login). */
  senha: string | null
  /** URL do portal do parceiro (cursos redirect). */
  portalUrl: string | null
}

export interface StudentNotificationItem {
  id: string
  title: string
  body: string | null
  level: string
  createdAt: string
  readAt: string | null
}

export interface StudentData {
  id: string
  nome: string
  email: string | null
  cpf: string | null
  fone: string | null
  fone2: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  rua: string | null
  bairro: string | null
  numero: string | null
  nascimento: string | null
  status: string
  apostila: string
  plataformaAlunoId: string | null
  /**
   * Senha do aluno na plataforma de aulas (EA), descriptografada para exibição
   * na gestão. `null` quando o aluno ainda não está na plataforma ou quando a
   * senha não pôde ser descriptografada (legado/zerada) — nesse caso só o login
   * é exibido.
   */
  plataformaSenha: string | null
  asaasCustomerId: string | null
  tenantName: string
  tenantSlug: string
  passwordSetAt: string | null
  lastLoginAt: string | null
  createdAt: string
  totalPaid: number
  enrollments: StudentEnrollmentItem[]
  payments: StudentPaymentItem[]
  notes: StudentNoteItem[]
  notifications: StudentNotificationItem[]
  /** Credenciais do LMS por curso (próprio do LMS ou parceiro). */
  lmsCredentials: StudentLmsCredentialItem[]
}

/** Define qual API root + permissoes o componente usa. */
export type ManagementScope =
  | { kind: "admin"; canEdit: boolean; canResetPassword: boolean }
  | { kind: "painel" }

export function apiBase(scope: ManagementScope, studentId: string): string {
  return scope.kind === "admin"
    ? `/api/admin/alunos/${studentId}`
    : `/api/painel/alunos/${studentId}`
}
