import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import { invalidateTenantCache } from "@/lib/tenant/cache-invalidation"
import {
  findOrCreateAsaasCustomer,
  createSubscription,
  cancelSubscription,
  getSubscription,
  listPayments,
  updateSubscription,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import { createPromoBilling } from "@/lib/asaas/promo"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { requireAdmin } from "@/lib/auth/admin-guard"
import {
  loadTenantLifecycle,
  assertCortesiaExcepcional,
  isDueDateStretched,
  CORTESIA_AUDIT,
  MIN_REASON_LENGTH,
  MAX_REASON_LENGTH,
  type CortesiaTrigger,
} from "@/lib/tenants/lifecycle"

const patchSchema = z
  .object({
    // 0 = tornar a revenda gratuita (cancela cobrança no Asaas).
    planValue: z.number().min(0).max(100000).optional(),
    // Promoção: as primeiras `promoMonths` mensalidades saem por `promoValue`.
    promoMonths: z.number().int().min(1).max(24).optional(),
    promoValue: z.number().min(0).max(100000).optional(),
    nextDueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "formato esperado YYYY-MM-DD")
      .optional(),
    ownerCpfCnpj: z.string().min(11).max(20).optional(),
    syncWithAsaas: z.boolean().default(true),
    // Justificativa da cortesia excepcional (ver `lib/tenants/lifecycle.ts`).
    reason: z.string().trim().min(MIN_REASON_LENGTH).max(MAX_REASON_LENGTH).optional(),
  })
  .refine(
    (d) =>
      (d.promoMonths === undefined && d.promoValue === undefined) ||
      (d.promoMonths !== undefined && d.promoValue !== undefined),
    { message: "Informe promoMonths e promoValue juntos", path: ["promoValue"] },
  )
  .refine(
    (d) =>
      d.promoMonths === undefined ||
      (d.planValue !== undefined && d.planValue > 0),
    {
      message: "Promoção exige a mensalidade cheia (planValue) maior que zero",
      path: ["promoValue"],
    },
  )

function isoDayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export const PATCH = withRequestContextParams<{ id: string }>(
  { action: "admin.revendedores.billing.update", route: "/api/admin/revendedores/[id]/billing" },
  async (request: Request, ctx) => {
  const guard = await requireAdmin("unidades.billing")
  if (!guard.ok) return guard.response
  const session = guard.ctx

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
      asaasPromoSubscriptionId: true,
      planValue: true,
      status: true,
      accountManagerId: true,
      salesUserId: true,
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
  // `unidades.billing` já decidiu QUEM mexe em cobrança; aqui fica o recorte de
  // QUAIS unidades — quem não vê a rede inteira alcança só a própria carteira.
  if (!(await session.canAccessTenant(tenant))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  // Cortesia excepcional: os três gatilhos que devolvem uma unidade ao ar sem
  // ela pagar. Avaliado ANTES de qualquer chamada ao Asaas — bloquear depois de
  // já ter cancelado a assinatura lá deixaria a unidade sem cobrança nenhuma.
  //
  // `planValue: 0` é o mais direto: além de zerar a mensalidade, o bloco de
  // persistência mais abaixo promove PENDING/SUSPENDED para ACTIVE sozinho.
  const cortesiaTrigger: CortesiaTrigger | null =
    parsed.data.planValue === 0
      ? "free"
      : parsed.data.promoMonths !== undefined || parsed.data.promoValue !== undefined
        ? "promo"
        : parsed.data.nextDueDate && isDueDateStretched(parsed.data.nextDueDate)
          ? "postpone"
          : null

  if (cortesiaTrigger) {
    const lifecycle = await loadTenantLifecycle(id)
    const verdict = assertCortesiaExcepcional({
      tenant: { neverActivated: lifecycle?.neverActivated ?? false },
      trigger: cortesiaTrigger,
      override: {
        allowed: session.can("unidades.cortesiaExcepcional"),
        reason: parsed.data.reason,
      },
    })

    if (verdict.blocked) {
      await logAudit({
        action: CORTESIA_AUDIT.blocked,
        resource: "Tenant",
        resourceId: id,
        actorUserId: session.userId,
        actorRole: session.role,
        actorEmail: session.email,
        tenantId: id,
        payloadBefore: { planValue: Number(tenant.planValue), status: tenant.status },
        payloadAfter: {
          trigger: cortesiaTrigger,
          planValue: parsed.data.planValue,
          promoMonths: parsed.data.promoMonths,
          promoValue: parsed.data.promoValue,
          nextDueDate: parsed.data.nextDueDate,
        },
      })
      return NextResponse.json(
        { error: verdict.message, requiresReason: verdict.requiresReason },
        { status: 403 },
      )
    }

    if (verdict.overridden) {
      await logAudit({
        action: CORTESIA_AUDIT.granted,
        resource: "Tenant",
        resourceId: id,
        actorUserId: session.userId,
        actorRole: session.role,
        actorEmail: session.email,
        tenantId: id,
        payloadBefore: { planValue: Number(tenant.planValue), status: tenant.status },
        payloadAfter: {
          trigger: cortesiaTrigger,
          planValue: parsed.data.planValue,
          promoMonths: parsed.data.promoMonths,
          promoValue: parsed.data.promoValue,
          nextDueDate: parsed.data.nextDueDate,
          reason: verdict.reason,
        },
      })
    }
  }

  // Capturas não-nulas: TS não preserva o narrowing de `tenant`/`parsed.data`
  // dentro das closures abaixo (ensureCustomerId).
  const tenantRow = tenant
  const data = parsed.data

  let asaasUpdated = false
  let invoiceUrl: string | null = null
  let firstPaymentId: string | null = null
  let newCustomerId: string | null = null
  let newSubscriptionId: string | null = null
  let newPromoSubscriptionId: string | null = null
  // null = limpar no banco; undefined = não mexer.
  let promoValueUpdate: number | null | undefined = undefined
  let promoMonthsUpdate: number | null | undefined = undefined
  let clearSubscription = false // virou gratuita
  let clearPromoSubscription = false // saiu de promo para valor único

  const wantsFree = parsed.data.planValue === 0
  const wantsPromo =
    !wantsFree &&
    parsed.data.promoMonths !== undefined &&
    parsed.data.promoValue !== undefined

  // Cancela uma subscription ignorando 404 (já inexistente no Asaas).
  async function cancelIgnoring404(subId: string | null): Promise<void> {
    if (!subId) return
    try {
      await cancelSubscription(subId)
    } catch (error) {
      if (!(error instanceof AsaasApiError && error.statusCode === 404)) throw error
    }
  }

  // Garante um customer no Asaas (cria se faltar). Lança NextResponse(400) se
  // precisar do CPF e ele não veio.
  async function ensureCustomerId(): Promise<string> {
    if (tenantRow.asaasCustomerId) return tenantRow.asaasCustomerId
    if (!data.ownerCpfCnpj) {
      throw NextResponse.json(
        { error: "CPF/CNPJ do responsável é obrigatório para criar a assinatura no Asaas" },
        { status: 400 },
      )
    }
    const { customer } = await findOrCreateAsaasCustomer({
      name: tenantRow.owner?.name ?? tenantRow.name,
      email: tenantRow.owner?.email ?? undefined,
      mobilePhone: tenantRow.owner?.phone ?? undefined,
      cpfCnpj: data.ownerCpfCnpj,
      externalReference: `tenant:${tenantRow.slug}`,
    })
    newCustomerId = customer.id // sempre persiste, seja novo ou encontrado
    return customer.id
  }

  if (parsed.data.syncWithAsaas) {
    try {
      if (wantsFree) {
        // ── Tornar gratuita: cancela tudo e zera as assinaturas ──
        await cancelIgnoring404(tenant.asaasSubscriptionId)
        await cancelIgnoring404(tenant.asaasPromoSubscriptionId)
        clearSubscription = true
        promoValueUpdate = null
        promoMonthsUpdate = null
        asaasUpdated = true
      } else if (wantsPromo) {
        // ── Definir/recriar promoção: duas assinaturas (promo + regular) ──
        if (!process.env.ASAAS_API_KEY) {
          return NextResponse.json(
            { error: "Asaas não configurado para criar cobrança" },
            { status: 400 },
          )
        }
        const customerId = await ensureCustomerId()
        await cancelIgnoring404(tenant.asaasSubscriptionId)
        await cancelIgnoring404(tenant.asaasPromoSubscriptionId)
        const result = await createPromoBilling({
          customerId,
          slug: tenant.slug,
          name: tenant.name,
          planValue: parsed.data.planValue!,
          promoValue: parsed.data.promoValue!,
          promoMonths: parsed.data.promoMonths!,
          baseDueDate: parsed.data.nextDueDate ?? isoDayPlus(3),
        })
        newSubscriptionId = result.regularSubscriptionId
        newPromoSubscriptionId = result.promoSubscriptionId
        invoiceUrl = result.invoiceUrl
        firstPaymentId = result.firstPaymentId
        promoValueUpdate = parsed.data.promoValue!
        promoMonthsUpdate = parsed.data.promoMonths!
        asaasUpdated = true
      } else {
        // ── Valor único (sem promo) ──
        const hadPromo = Boolean(tenant.asaasPromoSubscriptionId)
        // Se existia promoção, encerra-a e volta à cobrança simples.
        if (hadPromo) {
          await cancelIgnoring404(tenant.asaasPromoSubscriptionId)
          clearPromoSubscription = true
          promoValueUpdate = null
          promoMonthsUpdate = null
        }

        if (tenant.asaasSubscriptionId) {
          // PUT /subscriptions/{id} não aceita "value": para mudar o valor (ou
          // sair de promo) cancela e recria a assinatura regular.
          if (parsed.data.planValue !== undefined || hadPromo) {
            await cancelIgnoring404(tenant.asaasSubscriptionId)
            let dueDate = parsed.data.nextDueDate
            if (!dueDate) {
              try {
                const sub = await getSubscription(tenant.asaasSubscriptionId)
                dueDate = sub.nextDueDate
              } catch {
                dueDate = isoDayPlus(3)
              }
            }
            const subscription = await createSubscription({
              customer: tenant.asaasCustomerId!,
              billingType: "UNDEFINED",
              value: parsed.data.planValue ?? Number(tenant.planValue),
              nextDueDate: dueDate,
              cycle: "MONTHLY",
              description: `Mensalidade Profissionaliza Mais Brasil — ${tenant.name}`,
              externalReference: `tenant:${tenant.slug}`,
            }, motherAsaasKey())
            newSubscriptionId = subscription.id
            asaasUpdated = true
            try {
              const payments = await listPayments({ subscription: subscription.id, limit: 1 })
              const firstPayment = payments.data[0] ?? null
              invoiceUrl = firstPayment?.invoiceUrl ?? null
              firstPaymentId = firstPayment?.id ?? null
            } catch {
              // webhook atualiza depois
            }
          } else if (parsed.data.nextDueDate !== undefined) {
            // Só a data mudou — tenta atualizar sem cancelar.
            try {
              await updateSubscription(tenant.asaasSubscriptionId, {
                nextDueDate: parsed.data.nextDueDate,
              })
              asaasUpdated = true
            } catch (error) {
              // Desync: o asaasSubscriptionId salvo pode apontar para uma
              // assinatura que o Asaas já não deixa editar (cancelada/sem
              // cobrança ativa → 404 ou "não pode ser atualizada"). Em vez de
              // falhar, recria a assinatura regular com a nova data — mesma
              // estratégia tolerante do ramo de mudança de valor acima.
              const stale =
                error instanceof AsaasApiError &&
                (error.statusCode === 404 ||
                  /não pode ser atualizada|cannot be updated/i.test(error.message))
              if (!stale || !tenant.asaasCustomerId) throw error
              await cancelIgnoring404(tenant.asaasSubscriptionId)
              const subscription = await createSubscription({
                customer: tenant.asaasCustomerId,
                billingType: "UNDEFINED",
                value: Number(tenant.planValue),
                nextDueDate: parsed.data.nextDueDate,
                cycle: "MONTHLY",
                description: `Mensalidade Profissionaliza Mais Brasil — ${tenant.name}`,
                externalReference: `tenant:${tenant.slug}`,
              }, motherAsaasKey())
              newSubscriptionId = subscription.id
              asaasUpdated = true
              try {
                const payments = await listPayments({ subscription: subscription.id, limit: 1 })
                const firstPayment = payments.data[0] ?? null
                invoiceUrl = firstPayment?.invoiceUrl ?? null
                firstPaymentId = firstPayment?.id ?? null
              } catch {
                // webhook atualiza depois
              }
            }
          }
        } else if (process.env.ASAAS_API_KEY) {
          // ── Sem subscription — criar customer (se precisar) + subscription ──
          const customerId = await ensureCustomerId()
          const planValue = parsed.data.planValue ?? Number(tenant.planValue)
          const dueDate = parsed.data.nextDueDate ?? isoDayPlus(3)
          const subscription = await createSubscription({
            customer: customerId,
            billingType: "UNDEFINED",
            value: planValue,
            nextDueDate: dueDate,
            cycle: "MONTHLY",
            description: `Mensalidade Profissionaliza Mais Brasil — ${tenant.name}`,
            externalReference: `tenant:${tenant.slug}`,
          }, motherAsaasKey())
          newSubscriptionId = subscription.id
          asaasUpdated = true
          try {
            const payments = await listPayments({ subscription: subscription.id, limit: 1 })
            const firstPayment = payments.data[0] ?? null
            invoiceUrl = firstPayment?.invoiceUrl ?? null
            firstPaymentId = firstPayment?.id ?? null
          } catch {
            // webhook atualiza depois
          }
        }
      }
    } catch (error) {
      // ensureCustomerId lança NextResponse (400) para erro de validação.
      if (error instanceof NextResponse) return error
      const message =
        error instanceof AsaasApiError
          ? error.message
          : "Falha ao sincronizar cobrança no Asaas"
      return NextResponse.json(
        { error: `Asaas: ${message}. Banco não foi alterado para manter consistência.` },
        { status: 502 },
      )
    }
  }

  // Persiste todas as mudanças no banco
  const updateData: Prisma.TenantUncheckedUpdateInput = {}
  if (parsed.data.planValue !== undefined) updateData.planValue = parsed.data.planValue
  if (newCustomerId) updateData.asaasCustomerId = newCustomerId
  if (clearSubscription) {
    updateData.asaasSubscriptionId = null
    updateData.asaasPromoSubscriptionId = null
    // Revenda gratuita não tem cobrança no Asaas e, portanto, nunca recebe o
    // webhook PAYMENT_RECEIVED que ativa o tenant. Se estava aguardando o
    // primeiro pagamento (PENDING) ou suspensa por inadimplência (SUSPENDED),
    // promove para ACTIVE — alinhado com a criação (status: isFree ? ACTIVE).
    // Sem isso a loja gratuita fica presa e o checkout devolve TENANT_INACTIVE.
    // CANCELLED é terminal e não é reativado aqui.
    if (tenant.status === "PENDING" || tenant.status === "SUSPENDED") {
      updateData.status = "ACTIVE"
    }
  } else {
    if (newSubscriptionId) updateData.asaasSubscriptionId = newSubscriptionId
    if (newPromoSubscriptionId) updateData.asaasPromoSubscriptionId = newPromoSubscriptionId
    else if (clearPromoSubscription) updateData.asaasPromoSubscriptionId = null
  }
  if (promoValueUpdate !== undefined) updateData.promoValue = promoValueUpdate
  if (promoMonthsUpdate !== undefined) updateData.promoMonths = promoMonthsUpdate
  await prisma.tenant.update({ where: { id }, data: updateData })

  // PERF-001: se ativou a revenda (free), invalida o cache p/ a vitrine vender já.
  if (updateData.status === "ACTIVE") {
    await invalidateTenantCache(id)
  }

  // SAAS-001: trilha de auditoria de alteração de billing (mensalidade/plano).
  await logAudit({
    action: "tenant.billing_update",
    resource: "Tenant",
    resourceId: id,
    actorUserId: session.userId,
    actorRole: session.role,
    actorEmail: session.email,
    tenantId: id,
    payloadBefore: { planValue: Number(tenant.planValue), status: tenant.status },
    payloadAfter: {
      planValue: parsed.data.planValue ?? Number(tenant.planValue),
      status: updateData.status ?? tenant.status,
      free: clearSubscription,
    },
  })

  return NextResponse.json({
    data: {
      ok: true,
      asaasUpdated,
      subscriptionCreated: Boolean(newSubscriptionId),
      free: clearSubscription,
      activated: updateData.status === "ACTIVE",
      // A cobrança foi arrumada, mas a unidade continua CANCELADA — a vitrine
      // segue fora do ar. Status e cobrança são independentes de propósito
      // (reativar é decisão explícita), então quem editou o Financeiro precisa
      // ser avisado de que falta um passo; sem isto o admin recria a assinatura
      // e acha que resolveu.
      stillCancelled:
        (updateData.status ?? tenant.status) === "CANCELLED" && asaasUpdated,
      promo: wantsPromo
        ? { months: parsed.data.promoMonths, value: parsed.data.promoValue }
        : null,
      planValue: parsed.data.planValue ?? Number(tenant.planValue),
      nextDueDate: parsed.data.nextDueDate ?? null,
      invoiceUrl,
      firstPaymentId,
    },
  })
  },
)
