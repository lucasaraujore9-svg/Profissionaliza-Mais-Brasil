import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import { contextLogger } from "@/lib/logger"
import { createNotification } from "@/lib/notifications"
import { afterResponse } from "@/lib/after-response"
import {
  MIN_SELLER_COMMISSION_PERCENT,
  minSalePrice,
  validateAuthorTerms,
  type AuthorTerms,
} from "@/lib/course-authoring/split"
import {
  AUTHORED_COURSE_LIST_SELECT,
  authoredCourseTerms,
  mapAuthoredCourse,
} from "@/lib/course-authoring/course-payload"
import { syncTenantWallet } from "@/lib/course-authoring/wallet"
import { isLmsAuthoringEnabled, setLmsCoursePublished } from "@/lib/lms/authoring"
import {
  ensureCourseForResellers,
  ensureTenantCourses,
} from "@/lib/tenant/ensure-courses"

const patchSchema = z.object({
  nome: z.string().trim().min(3).max(160).optional(),
  descricao: z.string().trim().max(4000).nullable().optional(),
  cargaHoraria: z.string().trim().max(60).nullable().optional(),
  capaImageUrl: z.string().url().nullable().optional(),
  pricingMode: z.enum(["FIXED", "MIN_PRICE", "MIN_PRODUCER_NET"]).optional(),
  authorAmount: z.number().positive().optional(),
  sellerCommissionPercent: z.number().min(MIN_SELLER_COMMISSION_PERCENT).max(100).optional(),
  distribution: z.enum(["OWN_ONLY", "OWN_AND_PMB", "NETWORK"]).optional(),
  authoredStatus: z.enum(["DRAFT", "PUBLISHED"]).optional(),
})

/**
 * Carrega o curso GARANTINDO a autoria. Filtrar por `authorTenantId` na query —
 * e não conferir depois — é o que impede uma unidade de editar os termos
 * comerciais do curso de outra pelo id.
 */
async function loadOwnedCourse(id: string, tenantId: string) {
  return prisma.course.findFirst({
    where: { id, authorTenantId: tenantId },
    select: AUTHORED_COURSE_LIST_SELECT,
  })
}

export const PATCH = withRequestContextParams<{ id: string }>(
  {
    action: "painel.cursos_autorais.update",
    route: "/api/painel/cursos-autorais/[id]",
  },
  async (request, context) => {
    const guard = await requirePainel("cursosAutorais.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await context.params

    const course = await loadOwnedCourse(id, ctx.tenantId)
    if (!course) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = patchSchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    // A pausa é da PMB e só ela desfaz. Sem esta trava o produtor reabria o
    // curso com um clique (o botão "Publicar" aparece justamente porque o
    // status não é PUBLISHED), e a única alavanca do /admin sobre o catálogo da
    // rede não valia nada.
    if (course.authoredStatus === "PAUSED" && data.authoredStatus !== undefined) {
      return NextResponse.json(
        {
          error:
            "Este curso foi pausado pela Profissionaliza Mais Brasil. Fale com o suporte para reativá-lo.",
          code: "AUTHORED_COURSE_PAUSED",
        },
        { status: 409 },
      )
    }

    const current = authoredCourseTerms(course)
    const terms: AuthorTerms = {
      pricingMode: data.pricingMode ?? course.pricingMode,
      authorAmount: data.authorAmount ?? current?.authorAmount ?? 0,
      sellerCommissionPercent:
        data.sellerCommissionPercent ?? current?.sellerCommissionPercent ?? 0,
      // A taxa NÃO é recalculada na edição: é o snapshot do acordo feito quando
      // o curso nasceu. Mudar a taxa global não pode reprecificar o passado.
      platformFeePercent: current?.platformFeePercent ?? 0,
    }
    const termsCheck = validateAuthorTerms(terms)
    if (!termsCheck.ok) {
      return NextResponse.json(
        { error: termsCheck.message, code: termsCheck.error },
        { status: 400 },
      )
    }

    const distribution = data.distribution ?? course.distribution
    const nextStatus = data.authoredStatus ?? course.authoredStatus ?? "DRAFT"
    const goesBeyondOwnStore = distribution !== "OWN_ONLY"

    // Sair da própria vitrine exige carteira: é para ela que o rateio manda o
    // repasse. Tentamos descobrir na hora antes de recusar — a unidade pode ter
    // conectado o Asaas depois de criar o curso.
    if (goesBeyondOwnStore) {
      let wallet = (
        await prisma.tenant.findUnique({
          where: { id: ctx.tenantId },
          select: { asaasWalletId: true },
        })
      )?.asaasWalletId
      if (!wallet) wallet = (await syncTenantWallet(ctx.tenantId)).walletId
      if (!wallet) {
        return NextResponse.json(
          {
            error:
              "Conecte a conta Asaas da unidade para vender este curso em outras vitrines — é para ela que o repasse é enviado.",
            code: "WALLET_REQUIRED",
          },
          { status: 409 },
        )
      }
    }

    // Publicar sem conteúdo cobraria o aluno e falharia no provisionamento.
    if (nextStatus === "PUBLISHED" && !course.lmsCourseId) {
      return NextResponse.json(
        {
          error:
            "Cadastre o conteúdo do curso na plataforma de aulas antes de publicá-lo.",
          code: "CONTENT_NOT_READY",
        },
        { status: 409 },
      )
    }

    const isPublished = nextStatus === "PUBLISHED"
    const floor = minSalePrice(terms)

    const updated = await prisma.course.update({
      where: { id: course.id },
      data: {
        ...(data.nome !== undefined ? { nome: data.nome } : {}),
        ...(data.descricao !== undefined ? { descricao: data.descricao } : {}),
        ...(data.cargaHoraria !== undefined ? { cargaHoraria: data.cargaHoraria } : {}),
        ...(data.capaImageUrl !== undefined ? { capaImageUrl: data.capaImageUrl } : {}),
        pricingMode: terms.pricingMode,
        authorAmount: terms.authorAmount,
        sellerCommissionPercent: terms.sellerCommissionPercent,
        distribution,
        authoredStatus: nextStatus,
        // `status` e `hiddenMain` são o que as vitrines de fato leem. Rascunho
        // sai de todas elas; publicado entra só onde o alcance manda.
        status: isPublished ? "ATIVO" : "INATIVO",
        hiddenMain: !(isPublished && distribution !== "OWN_ONLY"),
        ...(isPublished && distribution !== "OWN_ONLY"
          ? { precoVitrineMain: floor }
          : {}),
      },
      select: AUTHORED_COURSE_LIST_SELECT,
    })

    // Mudar os termos deixaria invendáveis as vitrines que ficaram fora da nova
    // regra: o curso continuaria listado e o checkout recusaria com o aluno na
    // tela. Elas são reprecificadas — e avisadas, porque o preço da loja delas
    // mudou sem elas terem pedido.
    //
    // O critério depende do modo: em FIXED o preço tem que ser IGUAL ao do
    // produtor, então quem está ACIMA também está inválido (`PRICE_MUST_MATCH_FIXED`
    // no checkout). Nos modos de piso só sobe quem está abaixo — mexer em quem
    // cobra mais seria reprecificar a loja dos outros sem motivo.
    const outOfRangePrice: Prisma.DecimalFilter =
      terms.pricingMode === "FIXED" ? { not: floor } : { lt: floor }
    const mispricedWhere = {
      courseId: course.id,
      price: outOfRangePrice,
      tenantId: { not: ctx.tenantId },
    }
    const raised = await prisma.tenantCourse.findMany({
      where: mispricedWhere,
      select: { tenantId: true },
    })
    if (raised.length > 0) {
      await prisma.tenantCourse.updateMany({
        where: mispricedWhere,
        data: { price: floor },
      })
      afterResponse(() =>
        Promise.all(
          raised.map((row) =>
            createNotification({
              audience: "TENANT",
              tenantId: row.tenantId,
              level: "WARNING",
              title: `Preço alterado pelo produtor — ${updated.nome}`,
              body: `${
                terms.pricingMode === "FIXED"
                  ? "O produtor deste curso passou a definir um preço fixo."
                  : "O produtor deste curso elevou o valor mínimo."
              } O preço na sua vitrine foi ajustado para R$ ${floor
                .toFixed(2)
                .replace(".", ",")}.`,
              category: "catalog",
              href: "/painel/cursos",
            }),
          ),
        ).then(() => undefined),
      )
    }

    // A linha na vitrine do PRÓPRIO autor precisa nascer agora. Sem isto, ele
    // publica e o curso não aparece na loja dele até alguém abrir o painel de
    // catálogo — que é quem roda `ensureTenantCourses` hoje.
    if (isPublished) {
      await ensureTenantCourses(ctx.tenantId).catch((err) => {
        contextLogger().warn(
          { event: "course_authoring.ensure_own_failed", courseId: course.id, err },
          "criação da linha na vitrine do autor falhou",
        )
      })
    }

    // Publicar para a rede precisa criar a linha em cada vitrine agora: a
    // vitrine pública das outras unidades não roda `ensureTenantCourses`.
    if (isPublished && distribution === "NETWORK") {
      await ensureCourseForResellers(course.id).catch((err) => {
        contextLogger().warn(
          { event: "course_authoring.propagate_failed", courseId: course.id, err },
          "propagação do curso de autoria falhou",
        )
      })
    }

    if (isLmsAuthoringEnabled() && course.lmsCourseId) {
      afterResponse(() =>
        setLmsCoursePublished(course.lmsCourseId as string, isPublished).catch((err) => {
          contextLogger().warn(
            { event: "course_authoring.lms_publish_failed", courseId: course.id, err },
            "não foi possível espelhar a publicação no LMS",
          )
        }),
      )
    }

    await logAudit({
      action: "authored_course.update",
      resource: "Course",
      resourceId: course.id,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId: ctx.tenantId,
      payloadBefore: {
        authoredStatus: course.authoredStatus,
        distribution: course.distribution,
        pricingMode: course.pricingMode,
        authorAmount: current?.authorAmount ?? null,
        sellerCommissionPercent: current?.sellerCommissionPercent ?? null,
      },
      payloadAfter: {
        authoredStatus: nextStatus,
        distribution,
        pricingMode: terms.pricingMode,
        authorAmount: terms.authorAmount,
        sellerCommissionPercent: terms.sellerCommissionPercent,
        repricedVitrines: raised.length,
      },
    })

    return NextResponse.json({ data: mapAuthoredCourse(updated) })
  },
)

export const DELETE = withRequestContextParams<{ id: string }>(
  {
    action: "painel.cursos_autorais.delete",
    route: "/api/painel/cursos-autorais/[id]",
  },
  async (_request, context) => {
    const guard = await requirePainel("cursosAutorais.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await context.params

    const course = await loadOwnedCourse(id, ctx.tenantId)
    if (!course) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    // Matrícula viva é aluno pagante com acesso: apagar o curso levaria junto o
    // vínculo dele. Despublicar tira das vitrines sem quebrar quem já comprou.
    //
    // Conta TODO status, não só os vivos: `Enrollment.course` e
    // `Certificate.course` são `onDelete: Restrict`. Filtrando por
    // ACTIVE/PENDING/COMPLETED, um curso com matrícula CANCELADA passava na
    // contagem, o `deleteMany` já tinha apagado as linhas de todas as vitrines
    // e só então o `course.delete` batia no P2003 — 500 genérico, curso fora
    // das lojas e ainda no catálogo.
    const [enrollments, certificates] = await Promise.all([
      prisma.enrollment.count({ where: { courseId: course.id } }),
      prisma.certificate.count({ where: { courseId: course.id } }),
    ])
    if (enrollments > 0 || certificates > 0) {
      return NextResponse.json(
        {
          error:
            enrollments > 0
              ? `Este curso tem ${enrollments} matrícula(s) no histórico. Despublique-o em vez de excluir.`
              : `Este curso tem ${certificates} certificado(s) emitido(s). Despublique-o em vez de excluir.`,
          code: "HAS_ENROLLMENTS",
        },
        { status: 409 },
      )
    }

    // Numa transação: sem ela, uma falha no `course.delete` deixaria o curso
    // fora de todas as vitrines e ainda existindo no catálogo.
    await prisma.$transaction(async (tx) => {
      await tx.tenantCourse.deleteMany({ where: { courseId: course.id } })
      await tx.course.delete({ where: { id: course.id } })
    })

    if (isLmsAuthoringEnabled() && course.lmsCourseId) {
      afterResponse(() =>
        setLmsCoursePublished(course.lmsCourseId as string, false).catch(() => undefined),
      )
    }

    await logAudit({
      action: "authored_course.delete",
      resource: "Course",
      resourceId: course.id,
      actorUserId: ctx.userId,
      actorRole: "RESELLER",
      tenantId: ctx.tenantId,
      payloadBefore: { nome: course.nome, authoredStatus: course.authoredStatus },
    })

    return NextResponse.json({ data: { deleted: true } })
  },
)
