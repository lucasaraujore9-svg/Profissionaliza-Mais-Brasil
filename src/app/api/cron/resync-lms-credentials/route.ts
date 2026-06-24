import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getLmsStudent, isLmsConfigured } from "@/lib/lms"
import { encrypt, decrypt } from "@/lib/crypto"
import { isCronAuthorized } from "@/lib/auth/bearer"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 300
export const dynamic = "force-dynamic"

/**
 * Reparo das credenciais do LMS por matrícula. A credencial só é gravada no 1º
 * fulfill bem-sucedido; se ela se perder (ex.: provisionamento parcial que só
 * ficou ok depois), este endpoint relê o aluno no LMS (GET /api/v1/students/:id)
 * e regrava `lmsLogin/lmsSenha/lmsPortalUrl` quando diverge.
 *
 * Toca SOMENTE os campos de credencial — o cron `day-update` cuida de
 * progresso/status, sem colisão.
 *
 * Roda no runtime de produção (LMS_API e ENCRYPTION_KEY são "Sensitive" e não
 * baixam local). Auth: Bearer CRON_SECRET. Dry-run por padrão; `?write=1` aplica.
 * O retorno nunca inclui senha em texto plano — só identificação + status.
 */
function decode(encrypted: string | null): string | null {
  if (!encrypted) return null
  try {
    return decrypt(encrypted)
  } catch {
    return null
  }
}

interface Outcome {
  studentId: string
  enrollmentId: string
  status: "updated" | "unchanged" | "skipped" | "failed"
}

async function resync(opts: { ids: string[]; write: boolean; limit: number }) {
  if (!isLmsConfigured()) {
    return {
      configured: false,
      write: opts.write,
      tally: { scanned: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 },
      details: [] as Outcome[],
    }
  }

  const students = await prisma.student.findMany({
    where: {
      ...(opts.ids.length ? { id: { in: opts.ids } } : {}),
      enrollments: { some: { lmsEnrollmentId: { not: null } } },
    },
    select: {
      id: true,
      enrollments: {
        where: { lmsEnrollmentId: { not: null } },
        select: {
          id: true,
          lmsLogin: true,
          lmsSenha: true,
          lmsPortalUrl: true,
          course: { select: { lmsCourseId: true } },
        },
      },
    },
    ...(opts.ids.length ? {} : { take: opts.limit }),
  })

  const tally = { scanned: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 }
  const details: Outcome[] = []
  const CONCURRENCY = 5

  async function processOne(s: (typeof students)[number]): Promise<void> {
    tally.scanned++

    // access por courseId do LMS (= Course.lmsCourseId no PMB).
    const accessByCourse = new Map<
      string,
      { login: string; password: string; portalUrl: string }
    >()
    try {
      const profile = await getLmsStudent(s.id)
      for (const c of profile.courses) {
        if (c.access) accessByCourse.set(c.courseId, c.access)
      }
    } catch {
      tally.failed++
      for (const e of s.enrollments) {
        details.push({ studentId: s.id, enrollmentId: e.id, status: "failed" })
      }
      return
    }

    for (const e of s.enrollments) {
      const lmsCourseId = e.course.lmsCourseId
      const access = lmsCourseId ? accessByCourse.get(lmsCourseId) : undefined
      if (!access) {
        tally.skipped++
        continue
      }

      const sameLogin = e.lmsLogin === access.login
      const samePassword = decode(e.lmsSenha) === access.password
      const samePortal = (e.lmsPortalUrl ?? "") === (access.portalUrl ?? "")
      if (sameLogin && samePassword && samePortal) {
        tally.unchanged++
        continue
      }

      if (opts.write) {
        await prisma.enrollment.update({
          where: { id: e.id },
          data: {
            lmsLogin: access.login,
            lmsSenha: encrypt(access.password),
            lmsPortalUrl: access.portalUrl,
          },
        })
      }
      tally.updated++
      details.push({ studentId: s.id, enrollmentId: e.id, status: "updated" })
    }
  }

  for (let i = 0; i < students.length; i += CONCURRENCY) {
    await Promise.all(students.slice(i, i + CONCURRENCY).map(processOne))
  }

  contextLogger().info(
    { event: "cron.resync_lms_credentials", write: opts.write, ...tally },
    "reparo de credenciais do LMS concluído",
  )
  return { configured: true, write: opts.write, tally, details }
}

export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(request.url)
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const write = url.searchParams.get("write") === "1"
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 1000) || 1000, 5000)

  const result = await resync({ ids, write, limit })
  return NextResponse.json({ data: result })
}

export async function GET(request: Request) {
  return POST(request)
}
