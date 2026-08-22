import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"

// Liga/desliga o módulo "Produzir cursos" de uma unidade — a habilitação que
// permite a ela criar curso próprio, definir os termos comerciais e publicar
// além da própria vitrine. Decisão COMERCIAL, no mesmo molde de
// `can-sell-resellers`: `unidades.governanca`, auditada.
//
// Não se confunde com `cursosAutorais.*`, que é permissão de PESSOA dentro da
// unidade. Ver `lib/course-authoring/module-gate.ts`.
const bodySchema = z.object({ enabled: z.boolean() })

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.course_authoring.update",
    route: "/api/admin/tenants/[id]/course-authoring",
  },
  async (request: Request, context) => {
    const guard = await requireAdmin("unidades.governanca")
    if (!guard.ok) return guard.response
    const session = guard.ctx
    const { id } = await context.params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id },
      select: { id: true, courseAuthoringEnabled: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }

    // Desligar NÃO despublica o que a unidade já produziu: o curso segue nas
    // vitrines e quem comprou segue com acesso. Tirar do ar o produto de alguém
    // por causa de uma mudança de habilitação puniria também os alunos dela — a
    // alavanca para isso é PAUSAR o curso em /admin/catalogo, que é explícita e
    // avisa a unidade. Aqui só se fecha a porta de criar e editar.
    const updated = await prisma.tenant.update({
      where: { id },
      data: { courseAuthoringEnabled: parsed.data.enabled },
      select: { id: true, courseAuthoringEnabled: true },
    })

    if (tenant.courseAuthoringEnabled !== updated.courseAuthoringEnabled) {
      await createNotification({
        audience: "TENANT",
        tenantId: id,
        level: updated.courseAuthoringEnabled ? "SUCCESS" : "WARNING",
        title: updated.courseAuthoringEnabled
          ? "Produção de cursos liberada"
          : "Produção de cursos desativada",
        body: updated.courseAuthoringEnabled
          ? "Sua unidade já pode criar cursos próprios em Catálogo → Meus cursos: você define o conteúdo, o preço mínimo e a comissão de quem vender."
          : "A criação e a edição de cursos próprios foram desativadas. Os cursos que você já publicou continuam à venda e seus alunos seguem com acesso.",
        category: "catalog",
        href: "/painel/cursos",
      }).catch(swallow("admin.tenants.course_authoring.notify"))
    }

    await logAudit({
      action: "tenant.course_authoring",
      resource: "Tenant",
      resourceId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      tenantId: id,
      payloadBefore: { courseAuthoringEnabled: tenant.courseAuthoringEnabled },
      payloadAfter: { courseAuthoringEnabled: updated.courseAuthoringEnabled },
    })

    return NextResponse.json({ data: updated })
  },
)
