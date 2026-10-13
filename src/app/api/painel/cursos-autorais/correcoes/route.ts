import { NextResponse } from "next/server"
import { requireCourseAuthoring } from "@/lib/course-authoring/module-gate"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { contextLogger } from "@/lib/logger"
import { isLmsAuthoringEnabled } from "@/lib/lms/authoring"
import { listLmsPendingGrading } from "@/lib/lms/grading"

/**
 * Fila de provas com questao dissertativa aguardando correcao, nos cursos que
 * ESTA unidade produziu. O escopo e aplicado pelo LMS (ver `lib/lms/grading.ts`).
 */
export const GET = withRequestContext(
  {
    action: "painel.cursos_autorais.correcoes.list",
    route: "/api/painel/cursos-autorais/correcoes",
  },
  async () => {
    const guard = await requireCourseAuthoring("cursosAutorais.view")
    if (!guard.ok) return guard.response
    const { ctx } = guard

    if (!isLmsAuthoringEnabled()) {
      return NextResponse.json({ data: { attempts: [] } })
    }

    try {
      const attempts = await listLmsPendingGrading(ctx.tenantId)
      return NextResponse.json({ data: { attempts } })
    } catch (err) {
      contextLogger().error(
        { event: "course_authoring.grading_list_failed", tenantId: ctx.tenantId, err },
        "falha ao listar correcoes no LMS",
      )
      return NextResponse.json(
        { error: "Não foi possível carregar as provas agora. Tente novamente.", code: "LMS_UNAVAILABLE" },
        { status: 502 },
      )
    }
  },
)
