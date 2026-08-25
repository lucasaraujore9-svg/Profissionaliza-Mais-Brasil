import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { parsePolicy } from "@/lib/pedagogia/policy"
import { inputToPolicy, pedagogyInputSchema, policyToInput } from "@/lib/pedagogia/schema"
import { syncTenantPedagogyToLms } from "@/lib/pedagogia/sync"

/**
 * REGRAS PEDAGOGICAS padrao da unidade (ordem / ritmo / horario).
 *
 * Vale para os cursos da PLATAFORMA PROPRIA. Na fornecedora legada nao ha grade
 * nossa para barrar aula a aula — o unico eixo que a alcanca e a janela de
 * horario, aplicada por login pela varredura `pedagogia/janela` (ver
 * `src/lib/pedagogia/ea-window.ts`). O GET devolve `alcance` para a tela poder
 * dizer isso a unidade em vez de prometer o que nao entrega.
 */
export const GET = withRequestContext(
  { action: "painel.pedagogia.get", route: "/api/painel/pedagogia" },
  async () => {
    const guard = await requirePainel("pedagogia.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const [tenant, cursos, overrides] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { pedagogyPolicy: true },
      }),
      // O ALCANCE da regra: quantos cursos da vitrine estao em cada plataforma.
      // A tela precisa dele para nao prometer o que a fornecedora legada nao faz.
      prisma.tenantCourse.findMany({
        where: { tenantId: ctx.tenantId, isVisible: true },
        select: { course: { select: { provider: true } } },
      }),
      prisma.tenantCourse.findMany({
        where: { tenantId: ctx.tenantId, pedagogyPolicy: { not: Prisma.DbNull } },
        select: { courseId: true, course: { select: { nome: true, provider: true } } },
        orderBy: { course: { nome: "asc" } },
      }),
    ])

    return NextResponse.json({
      politica: policyToInput(parsePolicy(tenant?.pedagogyPolicy)),
      alcance: {
        proprios: cursos.filter((c) => c.course.provider === "LMS").length,
        parceira: cursos.filter((c) => c.course.provider !== "LMS").length,
      },
      overrides: overrides.map((o) => ({
        courseId: o.courseId,
        nome: o.course.nome,
        provider: o.course.provider,
      })),
    })
  },
)

export const PUT = withRequestContext(
  { action: "painel.pedagogia.update", route: "/api/painel/pedagogia" },
  async (request: Request) => {
    const guard = await requirePainel("pedagogia.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    const parsed = pedagogyInputSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", detalhes: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const before = await prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { pedagogyPolicy: true, slug: true },
    })
    if (!before) return NextResponse.json({ error: "Unidade não encontrada" }, { status: 404 })

    const policy = inputToPolicy(parsed.data)
    await prisma.tenant.update({
      where: { id: ctx.tenantId },
      // O Prisma nao aceita uma interface fechada como InputJsonValue (falta a
      // index signature). O spread produz o mesmo objeto, sem `as unknown as`.
      data: { pedagogyPolicy: { ...policy } },
    })

    // Propaga DEPOIS da escrita local: o nosso banco e a fonte da verdade, e a
    // plataforma de aulas fora do ar nao pode impedir a unidade de configurar.
    // A falha e devolvida no corpo para a tela avisar — e nao virar um "salvo!"
    // que o aluno nao sente.
    const propagado = await syncTenantPedagogyToLms(
      { id: ctx.tenantId, slug: before.slug },
      policy,
    )

    // A regra alcanca aluno que JA COMPROU: quem mudou o acesso de quem pagou
    // precisa ficar na trilha, com o antes e o depois.
    await logAudit({
      action: "tenant.pedagogia.update",
      resource: "Tenant",
      resourceId: ctx.tenantId,
      actorUserId: ctx.userId,
      actorRole: ctx.memberRole,
      tenantId: ctx.tenantId,
      payloadBefore: before.pedagogyPolicy ?? null,
      payloadAfter: policy,
    })

    return NextResponse.json({ ok: true, politica: policyToInput(policy), propagado })
  },
)
