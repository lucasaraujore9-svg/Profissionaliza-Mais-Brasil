import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"

const schema = z.object({
  /** PAUSED tira das vitrines; PUBLISHED devolve o curso ao ar. */
  authoredStatus: z.enum(["PUBLISHED", "PAUSED"]),
  motivo: z.string().trim().max(500).optional(),
})

/**
 * Pausa (ou reativa) um curso produzido por uma unidade.
 *
 * É a única intervenção da PMB no conteúdo da rede, e ela é REATIVA por
 * decisão do dono — não existe fila de aprovação. Pausar NÃO apaga nada e não
 * mexe em matrícula: quem já comprou continua com acesso, porque cortar o
 * acesso de um aluno que pagou por causa de um problema entre PMB e unidade
 * seria punir a pessoa errada.
 */
export const PATCH = withRequestContextParams<{ id: string }>(
  {
    action: "admin.cursos_autorais.status",
    route: "/api/admin/cursos-autorais/[id]",
  },
  async (request, context) => {
    const guard = await requireAdmin("cursosAutorais.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await context.params

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

    const course = await prisma.course.findFirst({
      where: { id, authorTenantId: { not: null } },
      select: {
        id: true,
        nome: true,
        authorTenantId: true,
        authoredStatus: true,
        distribution: true,
      },
    })
    if (!course) {
      return NextResponse.json(
        { error: "Curso de autoria não encontrado" },
        { status: 404 },
      )
    }

    const next = parsed.data.authoredStatus
    const isPaused = next === "PAUSED"

    await prisma.course.update({
      where: { id: course.id },
      data: {
        authoredStatus: next,
        // `status` e `hiddenMain` são o que as vitrines de fato leem — mudar só
        // o `authoredStatus` deixaria o curso pausado no papel e à venda na
        // prática.
        status: isPaused ? "INATIVO" : "ATIVO",
        hiddenMain: isPaused || course.distribution === "OWN_ONLY",
      },
    })

    // A unidade precisa saber, e por quê: o produto dela saiu do ar sem que ela
    // tenha feito nada.
    await createNotification({
      audience: "TENANT",
      tenantId: course.authorTenantId as string,
      level: isPaused ? "WARNING" : "SUCCESS",
      title: isPaused
        ? `Curso pausado pela PMB — ${course.nome}`
        : `Curso reativado — ${course.nome}`,
      body: isPaused
        ? parsed.data.motivo
          ? `Motivo: ${parsed.data.motivo}`
          : "Fale com o suporte da Profissionaliza Mais Brasil para entender o motivo. Quem já comprou continua com acesso."
        : "O curso voltou a ser vendido nas vitrines do alcance que você definiu.",
      category: "catalog",
      href: "/painel/cursos",
    }).catch(swallow("admin.cursos_autorais.notify"))

    await logAudit({
      action: isPaused ? "authored_course.pause" : "authored_course.resume",
      resource: "Course",
      resourceId: course.id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      tenantId: course.authorTenantId,
      payloadBefore: { authoredStatus: course.authoredStatus },
      payloadAfter: { authoredStatus: next, motivo: parsed.data.motivo ?? null },
    })

    return NextResponse.json({ data: { id: course.id, authoredStatus: next } })
  },
)
