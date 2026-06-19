import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"

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
    const guard = await requireSuperAdmin()
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

    const result = await prisma.course.updateMany({
      where: { provider },
      data: { hiddenMain: hidden },
    })

    return NextResponse.json({
      data: { provider, action, count: result.count },
    })
  },
)
