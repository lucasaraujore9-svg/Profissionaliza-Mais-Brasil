import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { blockStudentInEA } from "@/lib/students/plataforma-actions"
import { createNotification } from "@/lib/notifications"
import { sendEmail } from "@/lib/email/mailer"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { appUrl } from "@/lib/tenant/urls"
import {
  emailBrandFromTenantRow,
  emailFromForBrand,
  type EmailBrand,
} from "@/lib/email/brand"
import { swallow } from "@/lib/errors"

export const maxDuration = 300
export const dynamic = "force-dynamic"

// Funil de avisos do fim do prazo de 12 meses. Marcos em dias antes do
// `expiresAt`: 60, 30, 15 e 2 dias (48h). O aviso "no dia da restrição" é
// disparado pelo bloco de encerramento (quando o acesso é de fato cortado).
// A dedup/catch-up usa `enrollment.accessWarnDaysSent` (não depende do cron
// cair exatamente no dia certo — se um dia for pulado, o marco ainda dispara).
const WARN_DAYS = [60, 30, 15, 2]
const DAY_MS = 1000 * 60 * 60 * 24

/** Monta a URL da área do aluno respeitando a vitrine/marca da unidade. */
function studentPanelUrl(brand: EmailBrand): string {
  const base = (brand.siteUrl ?? appUrl()).replace(/\/$/, "")
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
 *   (apenas se não houver outra matrícula ainda dentro do prazo) e avisa o aluno
 *   (e-mail + notificação in-app) de que o acesso foi encerrado — "no dia da
 *   restrição".
 * - Avisa por e-mail + notificação in-app nos marcos 60, 30, 15 e 2 dias (48h)
 *   antes do fim.
 *
 * Idempotência: matrículas expiradas viram CANCELLED (saem do filtro), então o
 * aviso de encerramento sai uma única vez; o bloqueio é guardado por
 * `student.status === ATIVO`; os avisos de proximidade são deduplicados por
 * `enrollment.accessWarnDaysSent`, que também garante catch-up se o cron pular
 * um dia.
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
          nome: true,
          email: true,
          status: true,
          enrollments: {
            where: { status: { in: ["ACTIVE", "SUSPENDED", "COMPLETED"] } },
            select: { id: true, expiresAt: true },
          },
        },
      },
      tenant: {
        select: {
          slug: true,
          name: true,
          customDomain: true,
          logoUrl: true,
          supportEmail: true,
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

      // Aviso "no dia da restrição": e-mail confirmando o encerramento. Sai uma
      // única vez porque a matrícula já foi marcada como CANCELLED acima.
      if (enrollment.student.email) {
        const brand = emailBrandFromTenantRow(enrollment.tenant)
        await sendEmail({
          to: enrollment.student.email,
          from: emailFromForBrand(brand),
          replyTo: brand.replyTo ?? undefined,
          subject: `Seu acesso a ${enrollment.course.nome} foi encerrado`,
          template: {
            type: "access-expiring",
            props: {
              studentName: enrollment.student.nome,
              courseName: enrollment.course.nome,
              expiresAtLabel: enrollment.expiresAt
                ? formatDateBR(enrollment.expiresAt)
                : formatDateBR(now),
              daysLeft: 0,
              studentPanelUrl: studentPanelUrl(brand),
              brand,
            },
          },
        }).catch(swallow("sweep-students-expired:email-encerrado"))
      }
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
      tenant: {
        select: {
          slug: true,
          name: true,
          customDomain: true,
          logoUrl: true,
          supportEmail: true,
        },
      },
    },
  })

  for (const enrollment of expiringSoon) {
    if (!enrollment.expiresAt) continue
    const daysLeft = Math.ceil(
      (enrollment.expiresAt.getTime() - now.getTime()) / DAY_MS,
    )

    // Marcos já vencidos (daysLeft <= marco) e ainda não notificados. Dispara um
    // único aviso refletindo os dias reais restantes e marca todos os marcos
    // vencidos de uma vez — evita reenvio e cobre dias pulados (catch-up).
    const alreadySent = enrollment.accessWarnDaysSent ?? []
    const dueMilestones = WARN_DAYS.filter(
      (d) => daysLeft <= d && !alreadySent.includes(d),
    )
    if (dueMilestones.length === 0) continue

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
        const brand = emailBrandFromTenantRow(enrollment.tenant)
        await sendEmail({
          to: enrollment.student.email,
          from: emailFromForBrand(brand),
          replyTo: brand.replyTo ?? undefined,
          subject: `Seu acesso a ${enrollment.course.nome} encerra em ${daysLeft} dia(s)`,
          template: {
            type: "access-expiring",
            props: {
              studentName: enrollment.student.nome,
              courseName: enrollment.course.nome,
              expiresAtLabel: formatDateBR(enrollment.expiresAt),
              daysLeft,
              studentPanelUrl: studentPanelUrl(brand),
              brand,
            },
          },
        }).catch(swallow("sweep-students-expired:email"))
      }

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { accessWarnDaysSent: { set: [...alreadySent, ...dueMilestones] } },
      })
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
