import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import {
  updateSubscription,
  AsaasApiError,
} from "@/lib/asaas/client"

const patchSchema = z.object({
  planValue: z.number().min(0).max(100000).optional(),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD")
    .optional(),
  syncWithAsaas: z.boolean().default(true),
})

interface Ctx {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, ctx: Ctx) {
  const guard = await requireSuperAdmin()
  if (!guard.ok) return guard.response

  const { id } = await ctx.params

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

  if (parsed.data.planValue === undefined && parsed.data.nextDueDate === undefined) {
    return NextResponse.json(
      { error: "Informe ao menos planValue ou nextDueDate" },
      { status: 400 },
    )
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      asaasSubscriptionId: true,
      planValue: true,
    },
  })
  if (!tenant) {
    return NextResponse.json(
      { error: "Revendedor não encontrado" },
      { status: 404 },
    )
  }
  if (tenant.slug === "__pmb__") {
    return NextResponse.json(
      { error: "Tenant interno PMB não pode ser editado" },
      { status: 400 },
    )
  }

  // Valida data: no minimo amanha
  if (parsed.data.nextDueDate) {
    const target = new Date(parsed.data.nextDueDate + "T00:00:00")
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    if (target.getTime() < todayMidnight.getTime()) {
      return NextResponse.json(
        { error: "A data de próximo vencimento não pode ser no passado" },
        { status: 400 },
      )
    }
  }

  // Sync com Asaas: apenas nextDueDate é suportado pelo PUT /subscriptions/{id}.
  // Alteração de value não é suportada pela API — só é salva localmente no banco.
  let asaasUpdated = false
  if (
    parsed.data.syncWithAsaas &&
    tenant.asaasSubscriptionId &&
    parsed.data.nextDueDate !== undefined
  ) {
    try {
      await updateSubscription(tenant.asaasSubscriptionId, {
        nextDueDate: parsed.data.nextDueDate,
      })
      asaasUpdated = true
    } catch (error) {
      const message =
        error instanceof AsaasApiError
          ? error.message
          : "Falha ao atualizar assinatura no Asaas"
      return NextResponse.json(
        {
          error: `Asaas: ${message}. Banco não foi alterado para manter consistência.`,
        },
        { status: 502 },
      )
    }
  }

  // Atualiza planValue local. nextDueDate vive no Asaas; nao temos coluna local
  // (o front mostra a partir do tenantPayment mais recente).
  await prisma.tenant.update({
    where: { id },
    data: {
      ...(parsed.data.planValue !== undefined
        ? { planValue: parsed.data.planValue }
        : {}),
    },
  })

  return NextResponse.json({
    data: {
      ok: true,
      asaasUpdated,
      planValue: parsed.data.planValue ?? Number(tenant.planValue),
      nextDueDate: parsed.data.nextDueDate ?? null,
    },
  })
}
