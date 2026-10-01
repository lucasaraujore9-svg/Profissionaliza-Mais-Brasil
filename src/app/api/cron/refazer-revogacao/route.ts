import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authorizeCron } from "@/lib/observability/cron-heartbeat"
import { unlinkCourseFromStudent } from "@/lib/students/plataforma-actions"
import { contextLogger } from "@/lib/logger"

export const maxDuration = 60
export const dynamic = "force-dynamic"

/**
 * Refaz a remoção do curso na plataforma de aulas para UMA matrícula cuja
 * revogação falhou — e devolve o erro inteiro da plataforma.
 *
 * Existe porque a remoção na plataforma legada responde HTTP 403 desde jul/2026
 * (59 de 59 na auditoria), e os segredos dela são Sensitive na Vercel: só o
 * runtime de produção consegue repetir a chamada e ler a resposta.
 *
 * Só alcança matrícula que JÁ deveria estar sem acesso: cancelada, ou de
 * assinatura encerrada. Matrícula viva é recusada — aqui não se cancela nada.
 *
 * Auth: Bearer CRON_SECRET. Disparo:
 * `app_internal.run_cron('/api/cron/refazer-revogacao?enrollment=<id>&apply=1')`.
 * Dry-run por padrão.
 */
export async function POST(request: Request) {
  if (!(await authorizeCron(request))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }
  const url = new URL(request.url)
  const id = url.searchParams.get("enrollment") ?? ""
  const apply = url.searchParams.get("apply") === "1"
  if (!id) return NextResponse.json({ error: "Informe enrollment=<id>" }, { status: 400 })

  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      studentId: true,
      courseId: true,
      course: { select: { nome: true, provider: true } },
      studentSubscription: { select: { status: true } },
    },
  })
  if (!enrollment) return NextResponse.json({ error: "Matrícula não encontrada" }, { status: 404 })

  const subEnded = ["CANCELLED", "EXPIRED"].includes(enrollment.studentSubscription?.status ?? "")
  if (enrollment.status !== "CANCELLED" && !subEnded) {
    return NextResponse.json(
      { error: "Matrícula viva: cancele antes de remover o acesso", status: enrollment.status },
      { status: 409 },
    )
  }

  const alvo = { curso: enrollment.course.nome, provider: enrollment.course.provider, status: enrollment.status }
  if (!apply) return NextResponse.json({ data: { apply, alvo } })

  try {
    await unlinkCourseFromStudent(enrollment.studentId, enrollment.courseId)
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err)
    contextLogger().warn({ event: "cron.refazer_revogacao.failed", enrollmentId: id, erro }, "revogação falhou de novo")
    return NextResponse.json({ data: { apply, alvo, ok: false, erro } })
  }
  // Mesma regra do cancelamento: só marca o que a plataforma confirmou.
  if (enrollment.status !== "CANCELLED") {
    await prisma.enrollment.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    })
  }
  return NextResponse.json({ data: { apply, alvo, ok: true } })
}

export async function GET(request: Request) {
  return POST(request)
}
