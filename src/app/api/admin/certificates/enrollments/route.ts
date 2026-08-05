import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  PACE_PRIMARY_SELECT,
  isConclusionBlockedByPace,
} from "@/lib/enrollment/pace-gate"
import { resolvePaceGateSettings } from "@/lib/enrollment/pace-settings"
import { PMB_TENANT_SLUG } from "@/lib/pmb-config"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

export const GET = withRequestContext(
  { action: "admin.certificates.enrollments.list", route: "/api/admin/certificates/enrollments" },
  async (request: Request) => {
  const guard = await requireAdmin("certificados.view")
  if (!guard.ok) return guard.response
  const ctx = guard.ctx

  const url = new URL(request.url)
  const studentId = url.searchParams.get("studentId")
  if (!studentId) {
    return NextResponse.json({ error: "studentId obrigatório" }, { status: 400 })
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      cpf: true,
      tenant: { select: { slug: true, accountManagerId: true, salesUserId: true } },
    },
  })
  if (!student) {
    return NextResponse.json({ error: "Aluno não encontrado" }, { status: 404 })
  }

  // Escopo por papel: a resposta carrega nome + CPF (PII) e a lista de
  // matriculas. Sem isto, qualquer membro PMB enumeraria alunos de qualquer
  // revendedor por studentId. Aluno PMB = tenant placeholder "__pmb__" (ou null).
  const isPmbStudent =
    student.tenantId === null || student.tenant?.slug === PMB_TENANT_SLUG
  if (!ctx.can("unidades.viewAll")) {
    const ok = isPmbStudent
      ? // Aluno da vitrine PMB: basta operar a vitrine.
        ctx.can("alunos.view")
      : // Aluno de uma unidade: só quem alcança aquela unidade na carteira.
        await ctx.canAccessTenant(student.tenant)
    if (!ok) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    include: {
      course: { select: { id: true, nome: true, cargaHoraria: true } },
      certificates: { select: { id: true, code: true, revokedAt: true } },
      tenant: { select: { id: true, name: true, slug: true } },
      // Satelite de compra com varios cursos herda o parcelamento da primaria —
      // sem isto a tela ofereceria "emitir certificado" num curso nao quitado.
      ...PACE_PRIMARY_SELECT,
    },
    take: 50,
  })

  // Interruptor por unidade: o admin lista matrículas de tenants diferentes.
  const paceGateByTenant = new Map<string | null, boolean>()
  for (const tid of new Set(enrollments.map((e) => e.tenantId))) {
    paceGateByTenant.set(tid, (await resolvePaceGateSettings(tid)).enabled)
  }

  return NextResponse.json({
    data: {
      student: {
        id: student.id,
        nome: student.nome,
        cpf: student.cpf,
        tenantId: student.tenantId,
      },
      enrollments: enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        courseName: e.course.nome,
        cargaHoraria: e.course.cargaHoraria,
        progressPercent: e.progressPercent ?? 0,
        progressStatus: e.progressStatus,
        // Cota de aulas: com parcelamento em aberto o backend RECUSA a emissão.
        // Sem este campo o formulário ofereceria um botão que sempre falha.
        // O admin enxerga várias unidades, então o interruptor é por tenant.
        paceBlocksConclusion: isConclusionBlockedByPace({
          ...e,
          gateEnabled: paceGateByTenant.get(e.tenantId) ?? false,
        }),
        installmentsPaid: e.installmentsPaid,
        installmentsTotal: e.installmentsTotal,
        hasActiveCertificate: e.certificates.some((c) => !c.revokedAt),
        tenantId: e.tenantId,
        tenantName: e.tenant?.name ?? "PMB (Vitrine principal)",
        createdAt: e.createdAt.toISOString(),
      })),
    },
  })
  },
)
