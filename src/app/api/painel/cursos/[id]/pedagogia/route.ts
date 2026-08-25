import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { inputToPolicy, pedagogyInputSchema, policyToInput } from "@/lib/pedagogia/schema"
import { parsePolicy } from "@/lib/pedagogia/policy"
import { syncCoursePedagogyToLms } from "@/lib/pedagogia/sync"
import { afterResponse } from "@/lib/after-response"

/**
 * Override das REGRAS PEDAGOGICAS de UM curso NESTA vitrine.
 *
 * `:id` e o `courseId`. O override mora no `TenantCourse` (a linha "curso X
 * nesta vitrine") e nao no `Course`: o mesmo curso e vendido por varias
 * unidades, cada uma com o proprio ritmo — gravar no `Course` faria a unidade A
 * mudar o ritmo dos alunos de B, C e D.
 *
 * DELETE remove o override e a vitrine volta a herdar o padrao da unidade.
 */

/** Confere que o curso esta NA vitrine desta unidade antes de qualquer escrita. */
async function loadTenantCourse(tenantId: string, courseId: string) {
  return prisma.tenantCourse.findUnique({
    where: { tenantId_courseId: { tenantId, courseId } },
    select: {
      id: true,
      pedagogyPolicy: true,
      course: { select: { nome: true, provider: true } },
    },
  })
}

export const PUT = withRequestContextParams<{ id: string }>(
  { action: "painel.pedagogia.curso.update", route: "/api/painel/cursos/[id]/pedagogia" },
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("pedagogia.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id: courseId } = await params

    const tc = await loadTenantCourse(ctx.tenantId, courseId)
    if (!tc) return NextResponse.json({ error: "Curso não está nesta vitrine" }, { status: 404 })

    const parsed = pedagogyInputSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", detalhes: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const policy = inputToPolicy(parsed.data)
    await prisma.tenantCourse.update({
      where: { tenantId_courseId: { tenantId: ctx.tenantId, courseId } },
      data: { pedagogyPolicy: { ...policy } },
    })

    await logAudit({
      action: "tenantCourse.pedagogia.update",
      resource: "TenantCourse",
      resourceId: tc.id,
      actorUserId: ctx.userId,
      actorRole: ctx.memberRole,
      tenantId: ctx.tenantId,
      payloadBefore: tc.pedagogyPolicy ?? null,
      payloadAfter: policy,
    })

    // A propagacao alcanca matricula a matricula e pode demorar; sai DEPOIS da
    // resposta para a tela nao ficar pendurada. `afterResponse` e nao `void`:
    // na Vercel a invocacao pode ser congelada assim que a resposta sai, e nem
    // o `.catch` de uma promise solta chegaria a rodar.
    afterResponse(() => syncCoursePedagogyToLms(ctx.tenantId, courseId))

    return NextResponse.json({ ok: true, politica: policyToInput(policy) })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  { action: "painel.pedagogia.curso.clear", route: "/api/painel/cursos/[id]/pedagogia" },
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("pedagogia.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id: courseId } = await params

    const tc = await loadTenantCourse(ctx.tenantId, courseId)
    if (!tc) return NextResponse.json({ error: "Curso não está nesta vitrine" }, { status: 404 })

    await prisma.tenantCourse.update({
      where: { tenantId_courseId: { tenantId: ctx.tenantId, courseId } },
      data: { pedagogyPolicy: Prisma.DbNull },
    })

    await logAudit({
      action: "tenantCourse.pedagogia.clear",
      resource: "TenantCourse",
      resourceId: tc.id,
      actorUserId: ctx.userId,
      actorRole: ctx.memberRole,
      tenantId: ctx.tenantId,
      payloadBefore: tc.pedagogyPolicy ?? null,
      payloadAfter: null,
    })

    // Sem esta propagacao as matriculas ficariam congeladas na regra REMOVIDA:
    // o override sai do nosso banco e continua valendo para o aluno, que e o
    // pior estado possivel — a tela diz uma coisa e a plataforma faz outra.
    afterResponse(() => syncCoursePedagogyToLms(ctx.tenantId, courseId))

    return NextResponse.json({ ok: true, politica: null })
  },
)

export const GET = withRequestContextParams<{ id: string }>(
  { action: "painel.pedagogia.curso.get", route: "/api/painel/cursos/[id]/pedagogia" },
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const guard = await requirePainel("pedagogia.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id: courseId } = await params

    const [tc, tenant] = await Promise.all([
      loadTenantCourse(ctx.tenantId, courseId),
      prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { pedagogyPolicy: true },
      }),
    ])
    if (!tc) return NextResponse.json({ error: "Curso não está nesta vitrine" }, { status: 404 })

    return NextResponse.json({
      nome: tc.course.nome,
      provider: tc.course.provider,
      // `null` = herda. A tela precisa distinguir "herda a unidade" de "tem
      // regra propria igual a da unidade": sao estados diferentes, e so o
      // primeiro acompanha uma futura mudanca no padrao.
      politica: tc.pedagogyPolicy == null ? null : policyToInput(parsePolicy(tc.pedagogyPolicy)),
      politicaDaUnidade: policyToInput(parsePolicy(tenant?.pedagogyPolicy)),
    })
  },
)
