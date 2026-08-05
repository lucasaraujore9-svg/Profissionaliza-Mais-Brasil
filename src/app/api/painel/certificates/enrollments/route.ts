import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  PACE_PRIMARY_SELECT,
  isConclusionBlockedByPace,
} from "@/lib/enrollment/pace-gate"
import { resolvePaceGateSettings } from "@/lib/enrollment/pace-settings"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"

export const GET = withRequestContext(
  { action: "painel.certificates.enrollments", route: "/api/painel/certificates/enrollments" },
  async (request: Request) => {
    const guard = await requirePainel("certificados.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const url = new URL(request.url)
    const studentId = url.searchParams.get("studentId")
    if (!studentId) {
      return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 })
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, tenantId: true, nome: true, cpf: true },
    })
    if (!student) {
      return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
    }
    if (student.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Aluno de outro tenant" }, { status: 403 })
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        course: { select: { id: true, nome: true, cargaHoraria: true } },
        certificates: { select: { id: true, code: true, revokedAt: true } },
        // Satelite de compra com varios cursos herda o parcelamento da primaria —
        // sem isto a tela ofereceria "emitir certificado" num curso nao quitado.
        ...PACE_PRIMARY_SELECT,
      },
      take: 50,
    })

    // A cota vale para esta unidade? Resolvido uma vez — o painel é single-tenant.
    const { enabled: paceGateEnabled } = await resolvePaceGateSettings(ctx.tenantId)

    return NextResponse.json({
      data: {
        student: {
          id: student.id,
          nome: student.nome,
          cpf: student.cpf,
        },
        enrollments: enrollments.map((e) => ({
          id: e.id,
          status: e.status,
          courseName: e.course.nome,
          cargaHoraria: e.course.cargaHoraria,
          progressPercent: e.progressPercent ?? 0,
          progressStatus: e.progressStatus,
          // Cota de aulas: com parcelamento em aberto o backend RECUSA a
          // emissão. Sem este campo o formulário ofereceria um botão que sempre
          // falha — a UI precisa saber o mesmo que o motor.
          paceBlocksConclusion: paceGateEnabled
            ? isConclusionBlockedByPace({ ...e, gateEnabled: true })
            : false,
          installmentsPaid: e.installmentsPaid,
          installmentsTotal: e.installmentsTotal,
          hasActiveCertificate: e.certificates.some((c) => !c.revokedAt),
          createdAt: e.createdAt.toISOString(),
        })),
      },
    })
  },
)
