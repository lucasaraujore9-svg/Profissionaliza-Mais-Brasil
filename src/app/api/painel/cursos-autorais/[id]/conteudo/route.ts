import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requirePainel } from "@/lib/auth/painel-guard"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { createLmsAuthorSsoToken, isLmsAuthoringEnabled } from "@/lib/lms/authoring"
import { appUrl } from "@/lib/tenant/urls"

/**
 * Abre a autoria do CONTEÚDO deste curso na plataforma de aulas.
 *
 * O link é de uso único e escopado à unidade dona do lado do LMS — o token não
 * pode abrir o curso de outra unidade nem o catálogo da PMB. Aqui garantimos a
 * outra metade: só emitimos para quem é autor do curso, filtrando por
 * `authorTenantId` na própria query.
 */
export const POST = withRequestContextParams<{ id: string }>(
  {
    action: "painel.cursos_autorais.conteudo",
    route: "/api/painel/cursos-autorais/[id]/conteudo",
  },
  async (_request, context) => {
    const guard = await requirePainel("cursosAutorais.manage")
    if (!guard.ok) return guard.response
    const { ctx } = guard
    const { id } = await context.params

    const course = await prisma.course.findFirst({
      where: { id, authorTenantId: ctx.tenantId },
      select: { id: true, lmsCourseId: true },
    })
    if (!course) {
      return NextResponse.json({ error: "Curso não encontrado" }, { status: 404 })
    }

    if (!isLmsAuthoringEnabled() || !course.lmsCourseId) {
      return NextResponse.json(
        {
          error:
            "A edição de conteúdo na plataforma de aulas ainda não está disponível para esta unidade.",
          code: "AUTHORING_UNAVAILABLE",
        },
        { status: 503 },
      )
    }

    try {
      const { url } = await createLmsAuthorSsoToken({
        ownerTenantExternalId: ctx.tenantId,
        lmsCourseId: course.lmsCourseId,
        returnUrl: `${appUrl()}/painel/cursos`,
      })
      return NextResponse.json({ data: { url } })
    } catch (err) {
      contextLogger().error(
        { event: "course_authoring.sso_failed", courseId: course.id, err },
        "falha ao emitir SSO de autoria",
      )
      return NextResponse.json(
        {
          error: "Não foi possível abrir a plataforma de aulas agora. Tente novamente.",
          code: "LMS_UNAVAILABLE",
        },
        { status: 502 },
      )
    }
  },
)
