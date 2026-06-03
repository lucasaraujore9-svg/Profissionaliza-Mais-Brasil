import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { sendEmail } from "@/lib/email/mailer"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { appUrl, vitrineUrl } from "@/lib/tenant/urls"
import { swallow } from "@/lib/errors"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Dias antes do encerramento em que o aluno recebe o aviso. Como o cron roda
// diariamente, disparar só nos dias exatos evita reenvio (dedup sem flag novo).
const WARN_DAYS = [7, 1]
const DAY_MS = 1000 * 60 * 60 * 24

/** Monta a URL da área do aluno respeitando a vitrine da unidade. */
function studentPanelUrl(tenant: {
  slug: string
  customDomain: string | null
} | null): string {
  if (!tenant) return `${appUrl()}/aluno`
  const base = tenant.customDomain
    ? `https://${tenant.customDomain}`
    : vitrineUrl(tenant.slug)
  return `${base}/aluno`
}

function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}

/**
 * Sweep diário do prazo de permanência (item 11 dos aperfeiçoamentos).
 *
 * - Encerra o acesso de matrículas cujo `expiresAt` já passou (12 meses desde a
 *   liberação): suspende a matrícula e bloqueia o aluno na plataforma parceira
 *   (apenas se não houver outra matrícula ainda dentro do prazo).
 * - Avisa por e-mail + notificação in-app quando faltam 7 ou 1 dia(s).
 *
 * Idempotência: matrículas expiradas viram CANCELLED (saem do filtro); o
 * bloqueio é guardado por `student.status === ATIVO`; o aviso só dispara no dia
 * exato (daysLeft ∈ WARN_DAYS).
 */
async function processExpiredStudents() {
  const now = new Date()
  const result = {
    expiredInspected: 0,
    enrollmentsExpired: 0,
    studentsBlocked: 0,
    warningsSent: 0,
    errors: [] as string[],
  }

  // ---------- 1) Encerramento (expiresAt já passou) ----------
  const expired = await prisma.enrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "SUSPENDED"] },
      expiresAt: { not: null, lte: now },
    },
    include: {
      course: { select: { nome: true } },
      student: {
        select: {
          id: true,
          status: true,
          enrollments: {
            where: { status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] } },
            select: { id: true, expiresAt: true },
          },
        },
      },
    },
  })
  result.expiredInspected = expired.length

  for (const enrollment of expired) {
    try {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: "CANCELLED" },
      })
      result.enrollmentsExpired += 1

      // Só bloqueia o aluno na plataforma se NÃO houver outra matrícula ainda
      // dentro do prazo (expiresAt no futuro ou sem prazo definido).
      const hasValidAccess = enrollment.student.enrollments.some((e) => {
        if (e.id === enrollment.id) return false
        return !e.expiresAt || e.expiresAt.getTime() > now.getTime()
      })

      if (!hasValidAccess && enrollment.student.status === "ATIVO") {
        await blockStudentInEA(enrollment.student.id)
        result.studentsBlocked += 1
      }

      await createNotification({
        audience: "STUDENT",
        studentId: enrollment.student.id,
        level: "WARNING",
        title: "Período de acesso encerrado",
        body: `Seu acesso ao curso ${enrollment.course.nome} chegou ao fim do prazo de permanência.`,
        category: "access",
        href: "/aluno/cursos",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`expira ${enrollment.id}: ${message}`)
    }
  }

  // ---------- 2) Aviso de proximidade do fim ----------
  const horizon = new Date(now.getTime() + (Math.max(...WARN_DAYS) + 1) * DAY_MS)
  const expiringSoon = await prisma.enrollment.findMany({
    where: {
      status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] },
      expiresAt: { not: null, gt: now, lte: horizon },
    },
    include: {
      course: { select: { nome: true } },
      student: { select: { id: true, nome: true, email: true } },
      tenant: { select: { slug: true, name: true, customDomain: true } },
    },
  })

  for (const enrollment of expiringSoon) {
    if (!enrollment.expiresAt) continue
    const daysLeft = Math.ceil(
      (enrollment.expiresAt.getTime() - now.getTime()) / DAY_MS,
    )
    if (!WARN_DAYS.includes(daysLeft)) continue

    try {
      await createNotification({
        audience: "STUDENT",
        studentId: enrollment.student.id,
        level: "WARNING",
        title: `Seu acesso encerra em ${daysLeft} dia(s)`,
        body: `O acesso ao curso ${enrollment.course.nome} encerra em ${formatDateBR(enrollment.expiresAt)}. Conclua o curso e emita seu certificado.`,
        category: "access",
        href: "/aluno/cursos",
      })

      if (enrollment.student.email) {
        await sendEmail({
          to: enrollment.student.email,
          subject: `Seu acesso a ${enrollment.course.nome} encerra em ${daysLeft} dia(s)`,
          template: {
            type: "access-expiring",
            props: {
              studentName: enrollment.student.nome,
              courseName: enrollment.course.nome,
              expiresAtLabel: formatDateBR(enrollment.expiresAt),
              daysLeft,
              studentPanelUrl: studentPanelUrl(enrollment.tenant),
              storeName: enrollment.tenant?.name,
            },
          },
        }).catch(swallow("sweep-students-expired:email"))
      }
      result.warningsSent += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido"
      result.errors.push(`aviso ${enrollment.id}: ${message}`)
    }
  }

  return result
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const result = await processExpiredStudents()
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
