/**
 * Tipos compartilhados entre /admin/alunos/[id] e /painel/alunos/[id].
 * Mesmo shape de dados, mesmo client component, endpoints diferentes
 * via prop `scope`.
 */
export interface StudentEnrollmentItem {
  id: string
  /** Curso técnico vinculado por esta matrícula. */
  courseName: string
  /** Pacote comercial da compra, quando esta matrícula faz parte de um pacote. */
  packageName: string | null
  /** Quantidade de cursos do pacote no momento da consulta. */
  packageCourseCount: number | null
  /** Identifica a matrícula que carrega a compra/cobrança do pacote. */
  packagePrimary: boolean
  /**
   * Venda direta com MAIS DE UM CURSO (sem pacote no catálogo): total de cursos
   * que esta cobrança cobre. `null` fora desse caso.
   */
  bundleCourseCount: number | null
  /**
   * Curso da matrícula que carregou a cobrança, quando ESTA matrícula é um
   * satélite de uma venda multi-curso (finalAmount 0). `null` fora desse caso.
   */
  bundleOfCourseName: string | null
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

  // ── Cota de aulas (venda parcelada) ───────────────────────────────────────
  /** Progresso sincronizado da plataforma de aulas (0-100). */
  progressPercent: number
  /**
   * Fatia do curso liberada pelas parcelas pagas (0-100), calculada no servidor
   * para a UI nunca discordar do motor. `null` = matricula fora da regra da
   * cota (a vista, cartao parcelado ou parcela unica).
   */
  paceAllowedPercent: number | null
  /** A matricula esta travada agora por ter atingido a cota? */
  paceBlocked: boolean
  /** Liberacao manual concedida (SUPER_ADMIN) — desarma a trava. */
  paceExemptAt: string | null
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
 * Credencial de acesso as aulas de UM curso. E por MATRICULA (e nao por aluno)
 * porque cada curso tem a sua.
 *
 * Este objeto e serializado no payload RSC da tela de gestao, entao ele nao
 * carrega nada sobre COMO o curso e atendido por baixo — so `isPartner`, e
 * apenas quando o caller e o sistema mae (ver `includeProviderOrigin` em
 * `loadStudentDetail`).
 */
export interface StudentCourseAccessItem {
  enrollmentId: string
  courseName: string
  login: string
  /** Senha descriptografada; `null` quando ausente/corrompida (só o login). */
  senha: string | null
  /** URL direta de acesso ao curso, quando existe. */
  portalUrl: string | null
  /**
   * Presente SO no sistema mae: o curso e servido por um parceiro por baixo.
   * `undefined` no painel da unidade — de proposito.
   */
  isPartner?: boolean
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
   * Senha do aluno na plataforma de aulas, descriptografada para exibição
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
  /** Credenciais de acesso às aulas, por curso. */
  courseAccess: StudentCourseAccessItem[]
  /**
   * A cota de aulas está valendo para a unidade deste aluno? Quando falsa, a UI
   * não mostra a coluna — exibir uma cota que não está sendo aplicada só
   * confundiria quem atende.
   */
  paceGateEnabled: boolean
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
