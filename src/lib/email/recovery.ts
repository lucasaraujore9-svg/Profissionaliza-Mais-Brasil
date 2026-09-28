import { prisma } from "@/lib/prisma"
import { sendEmail } from "./mailer"
import { PMB_EMAIL_BRAND, emailFromForBrand } from "./brand"
import { loadTenantEmailBrand } from "./tenant-brand"
import { sendPasswordLink } from "@/lib/auth/password-link"
import { appUrl } from "@/lib/tenant/urls"
import { contextLogger } from "@/lib/logger"

/**
 * Recuperação dos e-mails perdidos no apagão da Hostinger (25/09 18:48 UTC até
 * o hotfix do pool, 28/09 15:40 UTC). O `email_logs` não guarda o corpo, então
 * nada é "reenviado": cada e-mail é GERADO de novo a partir do estado atual.
 *
 *  - ACESSO (student-welcome / reset-password): link para criar a senha, 72h.
 *    Não troca a senha de ninguém — a senha temporária do welcome se perdeu, e
 *    trocá-la de novo arriscaria deixar a pessoa com outra senha desconhecida se
 *    este envio também falhasse.
 *  - MATRÍCULA (enrollment): "Matrícula confirmada" refeito da matrícula real,
 *    sem as credenciais da plataforma de aulas (ela manda as próprias).
 *
 * Fica de fora de propósito: `notification` (a cópia está no sininho do
 * painel), avisos de cobrança da unidade (o estado mudou desde então) e leads.
 *
 * Idempotente pelo próprio log: quem já tem um SENT posterior do mesmo tipo sai
 * da lista, então rodar de novo continua de onde parou.
 */
export const RECOVERY_WINDOW_START = new Date("2026-09-25T18:48:00Z")
export const RECOVERY_WINDOW_END = new Date("2026-09-28T15:40:00Z")
export const RECOVERY_LINK_MINUTES = 72 * 60

/** Espaço entre envios: vários e-mails iguais em sequência foi o que suspendeu o domínio. */
export const RECOVERY_SPACING_MS = 45_000

const ENROLLMENT_PREFIXES = ["Matrícula confirmada em ", "Novo curso liberado: "] as const

export interface AccessCandidate {
  email: string
  tenantId: string | null
  firstFailed: Date
}

export interface EnrollmentCandidate {
  email: string
  subject: string
  tenantId: string | null
  firstFailed: Date
}

export interface RecoveryOutcome {
  kind: "access" | "enrollment"
  email: string
  result: "sent" | "would_send" | "skipped" | "failed"
  reason?: string
}

export async function listAccessCandidates(): Promise<AccessCandidate[]> {
  return prisma.$queryRaw<AccessCandidate[]>`
    WITH f AS (
      SELECT lower("to") AS email,
             min(created_at) AS "firstFailed",
             (array_agg(tenant_id ORDER BY created_at) FILTER (WHERE tenant_id IS NOT NULL))[1] AS "tenantId"
        FROM email_logs
       WHERE status = 'FAILED'
         AND template IN ('student-welcome', 'reset-password')
         AND created_at >= ${RECOVERY_WINDOW_START}
         AND created_at < ${RECOVERY_WINDOW_END}
         AND position(',' in "to") = 0
       GROUP BY lower("to")
    )
    SELECT f.* FROM f
     WHERE NOT EXISTS (
       SELECT 1 FROM email_logs s
        WHERE s.status = 'SENT'
          AND s.template IN ('student-welcome', 'reset-password')
          AND lower(s."to") = f.email
          AND s.created_at > f."firstFailed")
     ORDER BY f."firstFailed"`
}

export async function listEnrollmentCandidates(): Promise<EnrollmentCandidate[]> {
  return prisma.$queryRaw<EnrollmentCandidate[]>`
    WITH f AS (
      SELECT lower("to") AS email, subject, tenant_id AS "tenantId",
             min(created_at) AS "firstFailed"
        FROM email_logs
       WHERE status = 'FAILED'
         AND template = 'enrollment'
         AND created_at >= ${RECOVERY_WINDOW_START}
         AND created_at < ${RECOVERY_WINDOW_END}
         AND position(',' in "to") = 0
       GROUP BY lower("to"), subject, tenant_id
    )
    SELECT f.* FROM f
     WHERE NOT EXISTS (
       SELECT 1 FROM email_logs s
        WHERE s.status = 'SENT'
          AND s.template = 'enrollment'
          AND lower(s."to") = f.email
          AND s.subject = f.subject
          AND s.created_at > f."firstFailed")
     ORDER BY f."firstFailed"`
}

/** Nome do curso a partir do assunto original; null se o formato não bate. */
export function courseNameFromSubject(subject: string): { course: string; isNew: boolean } | null {
  for (const prefix of ENROLLMENT_PREFIXES) {
    if (subject.startsWith(prefix)) {
      return { course: subject.slice(prefix.length), isNew: prefix === ENROLLMENT_PREFIXES[0] }
    }
  }
  return null
}

async function findStudent(email: string, tenantId: string | null) {
  return prisma.student.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(tenantId ? { tenantId } : {}),
    },
    // Log sem unidade (o welcome de `provisionStudentAccess` não grava) e o
    // mesmo e-mail em duas lojas: a conta mais NOVA é a que disparou o welcome.
    orderBy: { createdAt: "desc" },
    select: { id: true, nome: true, email: true, tenantId: true, lastLoginAt: true },
  })
}

/**
 * Decide sem enviar: motivo para pular, ou a unidade da conta que recebe o link
 * (a loja certa quando o log não tinha unidade).
 */
async function accessDecision(
  c: AccessCandidate,
): Promise<{ skip: string } | { tenantId: string | null }> {
  const student = await findStudent(c.email, c.tenantId)
  // Entrou depois da falha: já tem acesso, um link agora só confundiria.
  if (student?.lastLoginAt && student.lastLoginAt > c.firstFailed) return { skip: "ja_entrou" }
  return { tenantId: student?.tenantId ?? c.tenantId }
}

async function sendEnrollment(c: EnrollmentCandidate, apply: boolean): Promise<RecoveryOutcome> {
  const base = { kind: "enrollment" as const, email: c.email }
  const parsed = courseNameFromSubject(c.subject)
  if (!parsed) return { ...base, result: "skipped", reason: "assunto_desconhecido" }

  const student = await findStudent(c.email, c.tenantId)
  if (!student?.email) return { ...base, result: "skipped", reason: "aluno_nao_encontrado" }

  // Só confirma matrícula que ainda vale — cancelada/estornada não recebe
  // "matrícula confirmada" dias depois.
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      studentId: student.id,
      status: { in: ["ACTIVE", "COMPLETED"] },
      course: { nome: parsed.course },
    },
    select: { id: true },
  })
  if (!enrollment) return { ...base, result: "skipped", reason: "matricula_nao_ativa" }
  if (!apply) return { ...base, result: "would_send" }

  const brand = c.tenantId ? await loadTenantEmailBrand(c.tenantId) : PMB_EMAIL_BRAND
  const storeBase = (brand.siteUrl ?? appUrl()).replace(/\/$/, "")
  await sendEmail({
    to: student.email,
    from: emailFromForBrand(brand),
    replyTo: brand.replyTo ?? undefined,
    tenantId: c.tenantId,
    // Mesmo assunto do original: é o que o torna idempotente (ver a lista).
    subject: c.subject,
    template: {
      type: "enrollment",
      props: {
        studentName: student.nome,
        studentEmail: student.email,
        courseName: parsed.course,
        studentPanelUrl: `${storeBase}/aluno`,
        isNewStudent: parsed.isNew,
        school: null,
        brand,
      },
    },
  })
  return { ...base, result: "sent" }
}

/**
 * Processa até `limit` e-mails ENVIÁVEIS (acesso primeiro, depois matrícula),
 * espaçados por `spacingMs`. Para no primeiro envio que falhar: se o provedor
 * voltou a recusar, insistir só piora.
 */
export async function recoverLostEmails(opts: {
  apply: boolean
  limit: number
  spacingMs?: number
}): Promise<{ outcomes: RecoveryOutcome[]; pendingAccess: number; pendingEnrollment: number }> {
  const spacingMs = opts.spacingMs ?? RECOVERY_SPACING_MS
  const access = await listAccessCandidates()
  const enrollments = await listEnrollmentCandidates()
  const outcomes: RecoveryOutcome[] = []
  let sends = 0

  const pause = async () => {
    if (opts.apply && sends > 0 && spacingMs > 0) {
      await new Promise((r) => setTimeout(r, spacingMs))
    }
  }

  try {
    for (const c of access) {
      if (sends >= opts.limit) break
      const decision = await accessDecision(c)
      if ("skip" in decision) {
        outcomes.push({ kind: "access", email: c.email, result: "skipped", reason: decision.skip })
        continue
      }
      if (!opts.apply) {
        outcomes.push({ kind: "access", email: c.email, result: "would_send" })
        sends++
        continue
      }
      await pause()
      const found = await sendPasswordLink(c.email, {
        expirationMinutes: RECOVERY_LINK_MINUTES,
        recovery: true,
        tenantId: decision.tenantId,
      })
      outcomes.push({
        kind: "access",
        email: c.email,
        result: found ? "sent" : "skipped",
        reason: found ? undefined : "conta_nao_encontrada",
      })
      if (found) sends++
    }
    for (const c of enrollments) {
      if (sends >= opts.limit) break
      if (opts.apply) {
        const probe = await sendEnrollment(c, false)
        if (probe.result !== "would_send") {
          outcomes.push(probe)
          continue
        }
        await pause()
      }
      const outcome = await sendEnrollment(c, opts.apply)
      outcomes.push(outcome)
      if (outcome.result === "sent" || outcome.result === "would_send") sends++
    }
  } catch (err) {
    contextLogger().error({ err, event: "email.recovery.send_failed" }, "recuperação de e-mail parou")
    outcomes.push({
      kind: "access",
      email: "-",
      result: "failed",
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
    })
  }

  const handled = new Set(outcomes.filter((o) => o.result === "sent").map((o) => `${o.kind}:${o.email}`))
  return {
    outcomes,
    pendingAccess: access.filter((c) => !handled.has(`access:${c.email}`)).length,
    pendingEnrollment: enrollments.filter((c) => !handled.has(`enrollment:${c.email}`)).length,
  }
}
