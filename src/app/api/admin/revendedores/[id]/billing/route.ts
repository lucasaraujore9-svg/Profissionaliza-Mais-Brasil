import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth/guards"
import {
  findOrCreateAsaasCustomer,
  createSubscription,
  listPayments,
  updateSubscription,
  AsaasApiError,
} from "@/lib/asaas/client"

const patchSchema = z.object({
  planValue: z.number().min(0).max(100000).optional(),
  nextDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD")
    .optional(),
  ownerCpfCnpj: z.string().min(11).max(20).optional(),
  syncWithAsaas: z.boolean().default(true),
})

interface Ctx {
  params: Promise<{ id: string }>
}

function isoDayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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
      name: true,
      asaasCustomerId: true,
      asaasSubscriptionId: true,
      planValue: true,
      owner: {
        select: { name: true, email: true, phone: true },
      },
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

  // Valida data: no minimo hoje
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

  let asaasUpdated = false
  let invoiceUrl: string | null = null
  let newCustomerId: string | null = null
  let newSubscriptionId: string | null = null

  if (parsed.data.syncWithAsaas) {
    const hasSubscription = Boolean(tenant.asaasSubscriptionId)
    const hasCustomer = Boolean(tenant.asaasCustomerId)

    // ── Caso 1: já tem subscription — só atualiza nextDueDate ────────────────
    if (hasSubscription && parsed.data.nextDueDate !== undefined) {
      try {
        await updateSubscription(tenant.asaasSubscriptionId!, {
          nextDueDate: parsed.data.nextDueDate,
        })
        asaasUpdated = true
      } catch (error) {
        const message =
          error instanceof AsaasApiError
            ? error.message
            : "Falha ao atualizar assinatura no Asaas"
        return NextResponse.json(
          { error: `Asaas: ${message}. Banco não foi alterado para manter consistência.` },
          { status: 502 },
        )
      }
    }

    // ── Caso 2: sem subscription — criar customer (se precisar) + subscription ─
    if (!hasSubscription && process.env.ASAAS_API_KEY) {
      try {
        let customerId = tenant.asaasCustomerId ?? null

        if (!hasCustomer) {
          if (!parsed.data.ownerCpfCnpj) {
            return NextResponse.json(
              { error: "CPF/CNPJ do responsável é obrigatório para criar a assinatura no Asaas" },
              { status: 400 },
            )
          }
          const { customer } = await findOrCreateAsaasCustomer({
            name: tenant.owner?.name ?? tenant.name,
            email: tenant.owner?.email ?? undefined,
            mobilePhone: tenant.owner?.phone ?? undefined,
            cpfCnpj: parsed.data.ownerCpfCnpj,
            externalReference: `tenant:${tenant.slug}`,
          })
          customerId = customer.id
          newCustomerId = customer.id // sempre persiste, seja novo ou encontrado
        }

        const planValue = parsed.data.planValue ?? Number(tenant.planValue)
        const dueDate = parsed.data.nextDueDate ?? isoDayPlus(3)

        const subscription = await createSubscription({
          customer: customerId!,
          billingType: "UNDEFINED",
          value: planValue,
          nextDueDate: dueDate,
          cycle: "MONTHLY",
          description: `Mensalidade Profissionaliza Mais Brasil — ${tenant.name}`,
          externalReference: `tenant:${tenant.slug}`,
        })
        newSubscriptionId = subscription.id
        asaasUpdated = true

        // Tenta buscar invoiceUrl do primeiro pagamento criado
        try {
          const payments = await listPayments({ subscription: subscription.id, limit: 1 })
          invoiceUrl = payments.data[0]?.invoiceUrl ?? null
        } catch {
          // webhook vai atualizar depois
        }
      } catch (error) {
        if (error instanceof NextResponse) throw error
        const message =
          error instanceof AsaasApiError
            ? error.message
            : "Falha ao criar assinatura no Asaas"
        return NextResponse.json(
          { error: `Asaas: ${message}` },
          { status: 502 },
        )
      }
    }
  }

  // Persiste todas as mudanças no banco
  await prisma.tenant.update({
    where: { id },
    data: {
      ...(parsed.data.planValue !== undefined ? { planValue: parsed.data.planValue } : {}),
      ...(newCustomerId ? { asaasCustomerId: newCustomerId } : {}),
      ...(newSubscriptionId ? { asaasSubscriptionId: newSubscriptionId } : {}),
    },
  })

  return NextResponse.json({
    data: {
      ok: true,
      asaasUpdated,
      subscriptionCreated: Boolean(newSubscriptionId),
      planValue: parsed.data.planValue ?? Number(tenant.planValue),
      nextDueDate: parsed.data.nextDueDate ?? null,
      invoiceUrl,
    },
  })
}
