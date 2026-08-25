import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

/**
 * UNIFICA categorias: os cursos das `sourceIds` passam para `targetId` e as
 * origens sao apagadas.
 *
 * ── Por que nao da para so apagar a duplicata ──────────────────────────────
 * `DELETE /categorias/[id]` existe, mas ele PERDE os cursos: o M2M
 * (`course_categories`) cai em cascata e `courses.category_id` vai a null pela FK.
 * Numa duplicata isso tira 8 cursos da vitrine em vez de move-los. Unificar e o
 * DELETE precedido da mudanca de dono — e por isso e uma rota propria, nao um
 * parametro do delete.
 *
 * ── O que precisa se mover junto ───────────────────────────────────────────
 *  1. `course_categories` (M2M) — a fonte de verdade de filtro e contagem;
 *  2. `courses.category_id` — a categoria PRINCIPAL, que decide o rotulo do card;
 *  3. `home_sections` com `config.categoryId` — a secao "Cursos de {categoria}",
 *     que o POST de criacao espalha para a PMB e para TODAS as unidades. Sobrando,
 *     ela viraria uma sanfona vazia apontando para uma categoria que nao existe.
 *
 * Esquecer (3) foi o que a rota de DELETE ja tratou; esquecer (1) ou (2) seria
 * perder curso da vitrine sem nenhum erro aparecer.
 */
const schema = z.object({
  targetId: z.string().trim().min(1, "Escolha a categoria que fica"),
  sourceIds: z.array(z.string().trim().min(1)).min(1, "Escolha ao menos uma para unificar"),
})

export const POST = withRequestContext(
  { action: "admin.catalogo.categorias.merge", route: "/api/admin/catalogo/categorias/unificar" },
  async (request: Request) => {
    const guard = await requireAdmin("catalogo.manage")
    if (!guard.ok) return guard.response
    const ctx = guard.ctx

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

    const { targetId } = parsed.data
    // A propria categoria de destino na lista de origens seria um pedido para
    // apagar o alvo no fim da operacao — some com tudo em vez de unificar.
    const sourceIds = [...new Set(parsed.data.sourceIds)].filter((id) => id !== targetId)
    if (sourceIds.length === 0) {
      return NextResponse.json(
        { error: "Escolha ao menos uma categoria diferente da que fica" },
        { status: 400 },
      )
    }

    const target = await prisma.category.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, slug: true },
    })
    if (!target) {
      return NextResponse.json({ error: "Categoria de destino não encontrada" }, { status: 404 })
    }

    const sources = await prisma.category.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, name: true, slug: true },
    })
    if (sources.length !== sourceIds.length) {
      return NextResponse.json(
        { error: "Alguma das categorias a unificar não existe mais" },
        { status: 404 },
      )
    }

    const links = await prisma.courseCategory.findMany({
      where: { categoryId: { in: sourceIds } },
      select: { courseId: true },
    })
    const cursos = [...new Set(links.map((l) => l.courseId))]

    const resultado = await prisma.$transaction(async (tx) => {
      // (1) M2M: `createMany` + `skipDuplicates` porque o curso pode ja estar nas
      // DUAS categorias (a PK composta recusaria a linha e derrubaria o lote).
      const criados = await tx.courseCategory.createMany({
        data: cursos.map((courseId) => ({ courseId, categoryId: target.id })),
        skipDuplicates: true,
      })

      // (2) categoria PRINCIPAL. So de quem apontava para uma das origens —
      // um `updateMany` sem esse filtro reescreveria o catalogo inteiro.
      const principais = await tx.course.updateMany({
        where: { categoryId: { in: sourceIds } },
        data: { categoryId: target.id },
      })

      // (3) secoes de vitrine das origens. Apagadas, e nao repontadas: repontar
      // criaria uma segunda sanfona da MESMA categoria em cada unidade que ja
      // tem a do destino. Espelha o que o DELETE da categoria ja fazia.
      const secoes = await tx.homeSection.deleteMany({
        where: {
          kind: "category_courses",
          OR: sourceIds.map((id) => ({ config: { path: ["categoryId"], equals: id } })),
        },
      })

      // As linhas M2M restantes das origens caem em cascata com o delete.
      await tx.category.deleteMany({ where: { id: { in: sourceIds } } })

      return {
        vinculosCriados: criados.count,
        principaisMovidas: principais.count,
        secoesRemovidas: secoes.count,
      }
    })

    await logAudit({
      action: "category.merge",
      resource: "Category",
      resourceId: target.id,
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      actorEmail: ctx.email,
      payloadBefore: { origens: sources.map((s) => ({ id: s.id, name: s.name, slug: s.slug })) },
      payloadAfter: {
        destino: { id: target.id, name: target.name, slug: target.slug },
        cursosAfetados: cursos.length,
        ...resultado,
      },
    })

    contextLogger().info(
      {
        event: "categorias.merge",
        target: target.slug,
        sources: sources.map((s) => s.slug),
        cursosAfetados: cursos.length,
        ...resultado,
      },
      "categorias unificadas",
    )

    return NextResponse.json({
      data: {
        target: { id: target.id, name: target.name, slug: target.slug },
        sources: sources.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
        cursosAfetados: cursos.length,
        ...resultado,
      },
    })
  },
)
