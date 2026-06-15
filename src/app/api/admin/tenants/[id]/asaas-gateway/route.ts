import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

// Libera/bloqueia o Asaas como gateway de vendas para UMA unidade. Capability
// controlada pelo Admin Master (default OFF). Espelha .../automacao. Quando
// desligado, tambem reverte salesGateway para MP e marca asaasConnected=false —
// uma unidade nao pode continuar vendendo por um gateway que foi revogado.
const bodySchema = z.object({
  enabled: z.boolean(),
})

export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.asaas_gateway.update",
    route: "/api/admin/tenants/[id]/asaas-gateway",
  },
  async (request: Request, context) => {
    const session = await requireAdminSession()
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    if (session.role !== "SUPER_ADMIN" && session.role !== "PMB_RESELLER_MGR") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
    }

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
      select: {
        id: true,
        slug: true,
        customDomain: true,
        accountManagerId: true,
        asaasGatewayEnabled: true,
      },
    })
    if (!tenant) {
      return NextResponse.json(
        { error: "Revendedor não encontrado" },
        { status: 404 },
      )
    }

    if (
      session.role === "PMB_RESELLER_MGR" &&
      tenant.accountManagerId !== session.userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const enabling = parsed.data.enabled
    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        asaasGatewayEnabled: enabling,
        // Ao revogar a capability, derruba o gateway ativo de volta para MP e
        // marca como desconectado (as credenciais permanecem cifradas no banco,
        // mas a unidade nao consegue mais transacionar pelo Asaas).
        ...(enabling ? {} : { salesGateway: "MP" as const, asaasConnected: false }),
      },
      select: { id: true, asaasGatewayEnabled: true, asaasConnected: true, salesGateway: true },
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    return NextResponse.json({ data: updated })
  },
)
