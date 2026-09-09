import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireStudentSession } from "@/lib/auth/student-session"
import {
  issueCertificateIfEligible,
  NotCertifiableError,
  MissingCpfError,
  PaceGateError,
} from "@/lib/certificates/issue"
import { isEnrollmentConcludedForCertificate } from "@/lib/certificates/eligibility"
import { syncStudentProgressBestEffort } from "@/lib/students/progress"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const schema = z.object({
  enrollmentId: z.string().min(1),
})

const SETTINGS_ID = "default"

/**
 * Emissão self-service do certificado pelo próprio aluno.
 *
 * Só emite quando o curso está concluído de acordo com o progresso
 * sincronizado da plataforma parceira (progressStatus = CONCLUIDO, ou
 * progressPercent >= certificateMinPercent). É idempotente: se já houver
 * certificado não revogado, devolve o existente.
 */
export const POST = withRequestContext(
  {
    action: "student.certificates.issue",
    route: "/api/student/certificates/issue",
  },
  async (request: Request) => {
    const session = await requireStudentSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }

    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Garante que a matrícula pertence ao aluno autenticado (isolamento).
    const enrollment = await prisma.enrollment.findUnique({
      where: { id: parsed.data.enrollmentId },
      select: {
        id: true,
        studentId: true,
        status: true,
        progressStatus: true,
        progressPercent: true,
      },
    })
    if (!enrollment || enrollment.studentId !== session.studentId) {
      return NextResponse.json(
        { error: "Matrícula não encontrada" },
        { status: 404 },
      )
    }

    if (enrollment.status === "PENDING" || enrollment.status === "CANCELLED") {
      return NextResponse.json(
        {
          error:
            "Esta matrícula não está liberada para emitir certificado. Conclua o pagamento e finalize o curso.",
        },
        { status: 400 },
      )
    }

    const settings = await prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
      select: { certificateMinPercent: true },
    })

    let concluded = isEnrollmentConcludedForCertificate(
      enrollment,
      settings.certificateMinPercent,
    )
    // Segunda chance com o progresso FRESCO. A plataforma de aulas não tem
    // webhook: a cópia local pode ter até 24h (cron das 07:00) e recusar quem
    // acabou de concluir. Só no caminho de recusa — o aluno que já consta
    // concluído não paga a latência da chamada externa.
    if (!concluded) {
      await syncStudentProgressBestEffort(
        session.studentId,
        "student.certificates.sync_failed",
      )
      const refreshed = await prisma.enrollment.findUnique({
        where: { id: enrollment.id },
        select: { status: true, progressStatus: true, progressPercent: true },
      })
      concluded = refreshed
        ? isEnrollmentConcludedForCertificate(
            refreshed,
            settings.certificateMinPercent,
          )
        : false
    }
    if (!concluded) {
      return NextResponse.json(
        {
          error:
            "Você ainda não concluiu este curso. Finalize as aulas na plataforma para liberar o certificado.",
        },
        { status: 400 },
      )
    }

    try {
      const cert = await issueCertificateIfEligible(enrollment.id, "AUTO")
      return NextResponse.json({ id: cert.id, code: cert.code }, { status: 200 })
    } catch (err) {
      // Cota de aulas: recusa ESPERADA e acionável — o aluno concluiu o
      // conteúdo mas ainda deve parcelas. Mandar "tente novamente" (o genérico
      // abaixo) seria conselho errado: repetir nunca vai funcionar, quitar sim.
      // Também não é erro de servidor — 400 com a mensagem real.
      // Conteúdo que não certifica (e-book): recusa DEFINITIVA. O botão nem
      // deveria ter aparecido — a área do aluno não o mostra para e-book —, mas
      // a rota é alcançável por POST direto, e "tente novamente" seria a pior
      // resposta possível para algo que nunca vai mudar.
      if (err instanceof NotCertifiableError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      if (err instanceof PaceGateError) {
        contextLogger().info(
          {
            event: "student.certificates.pace_blocked",
            enrollmentId: enrollment.id,
            studentId: session.studentId,
          },
          "certificado recusado — parcelamento em aberto",
        )
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      // Cadastro sem CPF: recusa esperada e acionável, igual à cota. Cair no
      // genérico abaixo mandaria o aluno "tentar novamente" para sempre.
      if (err instanceof MissingCpfError) {
        contextLogger().info(
          {
            event: "student.certificates.cpf_missing",
            enrollmentId: enrollment.id,
            studentId: session.studentId,
          },
          "certificado recusado — aluno sem CPF no cadastro",
        )
        return NextResponse.json(
          { error: err.message, code: "STUDENT_CPF_REQUIRED" },
          { status: 400 },
        )
      }
      contextLogger().error(
        {
          err,
          event: "student.certificates.issue_failed",
          enrollmentId: enrollment.id,
          studentId: session.studentId,
        },
        "falha ao emitir certificado self-service",
      )
      return NextResponse.json(
        { error: "Não foi possível emitir o certificado agora. Tente novamente." },
        { status: 500 },
      )
    }
  },
)
