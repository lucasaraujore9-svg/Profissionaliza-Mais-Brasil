import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdminSession } from "@/lib/auth/admin-session"
import { invalidateTenant } from "@/lib/redis/tenant-cache"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { logAudit } from "@/lib/audit"
import {
  MIN_BOLETO_INSTALLMENTS,
  MAX_BOLETO_INSTALLMENTS,
} from "@/lib/installments/schedule"

const bodySchema = z.object({
  allowed: z.boolean(),
  maxCount: z
    .number()
    .int()
    .min(MIN_BOLETO_INSTALLMENTS)
    .max(MAX_BOLETO_INSTALLMENTS),
})

// Capability de venda parcelada no boleto (carnê), liberada pelo Admin Master.
// Espelha /api/admin/tenants/[id]/mensalidade. A unidade ainda precisa ATIVAR
// (boletoInstallmentEnabled) em /painel/configuracoes.
export const PUT = withRequestContextParams<{ id: string }>(
  {
    action: "admin.tenants.boleto_installment.update",
    route: "/api/admin/tenants/[id]/boleto-installment",
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
        boletoInstallmentAllowed: true,
        boletoInstallmentMaxCount: true,
      },
    })
    if (!tenant) {
      return NextResponse.json({ error: "Revendedor não encontrado" }, { status: 404 })
    }

    if (
      session.role === "PMB_RESELLER_MGR" &&
      tenant.accountManagerId !== session.userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        boletoInstallmentAllowed: parsed.data.allowed,
        boletoInstallmentMaxCount: parsed.data.maxCount,
      },
      select: {
        id: true,
        boletoInstallmentAllowed: true,
        boletoInstallmentEnabled: true,
        boletoInstallmentMaxCount: true,
      },
    })

    await invalidateTenant({
      id: tenant.id,
      slug: tenant.slug,
      customDomain: tenant.customDomain,
    })

    await logAudit({
      action: "tenant.boleto_installment.update",
      resource: "Tenant",
      resourceId: id,
      actorUserId: session.userId,
      actorRole: session.role,
      tenantId: id,
      payloadBefore: {
        boletoInstallmentAllowed: tenant.boletoInstallmentAllowed,
        boletoInstallmentMaxCount: tenant.boletoInstallmentMaxCount,
      },
      payloadAfter: {
        boletoInstallmentAllowed: parsed.data.allowed,
        boletoInstallmentMaxCount: parsed.data.maxCount,
      },
    })

    return NextResponse.json({ data: updated })
  },
)
