import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"

/* ------------------------------------------------------------------ */
/* POST — exibe/oculta EM MASSA todos os cursos de uma fornecedora na   */
/* vitrine PMB, via `hiddenMain`. NÃO mexe em `status` (publicação na   */
/* plataforma) nem na visibilidade por revenda — só na vitrine mãe.    */
/* "show" => hiddenMain=false (aparece) · "hide" => hiddenMain=true.    */
/* ------------------------------------------------------------------ */
const schema = z.object({
  provider: z.enum(["EA", "LMS"]),
  action: z.enum(["show", "hide"]),
})

export const POST = withRequestContext(
  {
    action: "admin.catalogo.bulk_provider_visibility",
    route: "/api/admin/catalogo/bulk-provider-visibility",
  },
  async (request: Request) => {
    const guard = await requireAdmin("catalogo.manage")
    if (!guard.ok) return guard.response

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

    const { provider, action } = parsed.data
    const hidden = action === "hide"

    // `authorTenantId: null` restringe a acao ao catalogo da PMB. "Ocultar
    // todos os cursos LMS" e uma ferramenta de curadoria do catalogo da casa —
    // curso de autoria de uma unidade tambem e provider=LMS, e sem esta clausula
    // um clique tiraria da vitrine principal o produto de toda a rede, sem que a
    // tela sequer mencione isso. Quem pausa curso de autoria e a acao dedicada
    // em /admin/catalogo, curso a curso.
    const result = await prisma.course.updateMany({
      where: { provider, authorTenantId: null },
      data: { hiddenMain: hidden },
    })

    return NextResponse.json({
      data: { provider, action, count: result.count },
    })
  },
)
