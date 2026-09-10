import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import { createNotification } from "@/lib/notifications"
import { swallow } from "@/lib/errors"

// Liga/desliga o módulo "Vender assinaturas" de uma unidade — a habilitação que
// deixa ela vender planos de assinatura na vitrine e na venda direta. Decisão
// COMERCIAL, no mesmo molde de `course-authoring`: `unidades.governanca`
// ("habilitar módulos"), auditada.
//
// Não se confunde com `assinaturas.*`, que é permissão de PESSOA dentro da
// unidade. Ver `lib/subscriptions/module.ts`.
const bodySchema = z.object({ enabled: z.boolean() })

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.assinaturas.update",
    route: "/api/admin/tenants/[id]/assinaturas",
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
      select: { id: true, subscriptionsEnabled: true },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }

    // Desligar NÃO cancela quem já assina: a recorrência segue no gateway da
    // unidade e o aluno segue com acesso ao ciclo que pagou. Cortar o acesso por
    // uma mudança de habilitação puniria o aluno, não a unidade. Também não
    // apaga nem desativa os planos dela — só deixam de ser vendidos, e voltam
    // como estavam se o módulo for religado.
    const updated = await prisma.tenant.update({
      where: { id },
      data: { subscriptionsEnabled: parsed.data.enabled },
      select: { id: true, subscriptionsEnabled: true },
    })

    if (tenant.subscriptionsEnabled !== updated.subscriptionsEnabled) {
      await createNotification({
        audience: "TENANT",
        tenantId: id,
        level: updated.subscriptionsEnabled ? "SUCCESS" : "WARNING",
        title: updated.subscriptionsEnabled
          ? "Venda de assinaturas liberada"
          : "Venda de assinaturas desativada",
        body: updated.subscriptionsEnabled
          ? "Sua unidade já pode vender assinaturas: monte os planos em Catálogo → Assinaturas e ofereça na vitrine e na venda direta."
          : "Os planos de assinatura saíram da sua vitrine e da venda direta. Quem já assina continua com acesso e com a cobrança normal, e os planos que você montou ficam guardados.",
        category: "catalog",
        href: "/painel/cursos",
      }).catch(swallow("admin.tenants.assinaturas.notify"))
    }

    await logAudit({
      action: "tenant.subscriptions_module",
      resource: "Tenant",
      resourceId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      actorEmail: session.email,
      tenantId: id,
      payloadBefore: { subscriptionsEnabled: tenant.subscriptionsEnabled },
      payloadAfter: { subscriptionsEnabled: updated.subscriptionsEnabled },
    })

    return NextResponse.json({ data: updated })
  },
)
