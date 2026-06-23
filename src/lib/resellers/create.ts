import { hash } from "bcryptjs"
import { randomBytes } from "node:crypto"
import { prisma } from "@/lib/prisma"
import { logAudit } from "@/lib/audit"
import {
  AsaasApiError,
  createCustomer,
  createSubscription,
  listPayments,
} from "@/lib/asaas/client"
import { createPromoBilling } from "@/lib/asaas/promo"
import { sendEmail, isEmailConfigured } from "@/lib/email/resend"
import { createNotification } from "@/lib/notifications"
import { appUrl, vitrineUrl as buildVitrineUrl } from "@/lib/tenant/urls"
import { generateUniqueReferralCode } from "@/lib/referrals/code"
import { contextLogger } from "@/lib/logger"
import { ensureTenantCourses } from "@/lib/tenant/ensure-courses"
import { ensureTenantHomeSections } from "@/lib/home/sections"
import { DEFAULT_AUTOMATION_TEMPLATES } from "@/lib/automation/default-templates"
import { forbiddenNameError } from "@/lib/tenant/forbidden-names"
import { validateSlugFormat, isSlugAvailable } from "@/lib/tenant/slug"

/**
 * Criação de revenda (tenant) — núcleo compartilhado entre:
 *   - /api/admin/revendedores (admin/equipe PMB cria/converte leads)
 *   - /api/painel/revendas    (revendedor-vendedor cria sub-revendas)
 *
 * A COBRANÇA é SEMPRE no Asaas da PMB (sistema mãe) — nunca no gateway da revenda
 * que está vendendo. A atribuição da indicação vem de `referrerTenantId` (no
 * fluxo do painel, a própria unidade vendedora). Centralizar aqui garante que os
 * dois fluxos compartilhem exatamente a mesma lógica de billing + onboarding.
 */

export interface CreateResellerInput {
  name: string
  slug: string
  ownerName: string
  ownerEmail: string
  ownerCpfCnpj: string
  ownerPhone?: string
  /** planValue 0 = revenda gratuita (sem cobrança no Asaas, nasce ACTIVE). */
  planValue: number
  firstPaymentMaxInstallments: number
  promoMonths?: number
  promoValue?: number
  automationEnabled?: boolean
  ejaEnabled?: boolean
  ejaUrl?: string | null
  tecnicaEnabled?: boolean
  tecnicaUrl?: string | null
  accountManagerId?: string | null
  salesUserId?: string | null
  referrerTenantId?: string | null
  canSellResellers?: boolean
  /** Ator que disparou a criação (para a trilha de auditoria). */
  actor: { userId: string; role: string; email?: string | null }
}

export interface CreateResellerSuccess {
  ok: true
  tenant: { id: string; slug: string; name: string; status: string }
  owner: { id: string; email: string }
  /** Senha em claro só quando o e-mail de onboarding NÃO foi enviado. */
  tempPassword: string | null
  vitrineUrl: string
  asaas: {
    configured: boolean
    customerId: string | null
    subscriptionId: string | null
    promoSubscriptionId: string | null
    free: boolean
    invoiceUrl: string | null
    firstPaymentId: string | null
    error: string | null
  }
  email: { configured: boolean; sent: boolean; error: string | null }
}

export type CreateResellerResult =
  | CreateResellerSuccess
  | { ok: false; status: number; error: string; fields?: Record<string, string[]> }

function isoDayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function createReseller(
  input: CreateResellerInput,
): Promise<CreateResellerResult> {
  // Formato do slug (regex/tamanho/reservados/marca).
  const slugError = validateSlugFormat(input.slug)
  if (slugError) return { ok: false, status: 400, error: slugError }

  // Marcas reservadas (contrato): o NOME da unidade também é checado.
  const forbidden = forbiddenNameError(input.name)
  if (forbidden) {
    return { ok: false, status: 400, error: forbidden, fields: { name: [forbidden] } }
  }

  // Disponibilidade: tenant existente OU slug reservado (rename nos últimos 15d).
  const availability = await isSlugAvailable(input.slug)
  if (!availability.available) {
    return {
      ok: false,
      status: 409,
      error: availability.reason ?? "Este endereço (slug) não está disponível.",
    }
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: input.ownerEmail },
    select: { id: true },
  })
  if (existingEmail) {
    return {
      ok: false,
      status: 409,
      error: `Já existe um usuário com o email ${input.ownerEmail}`,
    }
  }

  // Senha temporária — enviada por e-mail; admin pode repassar se o e-mail falhar.
  const tempPassword = randomBytes(9).toString("base64url")
  const passwordHash = await hash(tempPassword, 12)

  // Cobrança no Asaas da PMB. Revenda gratuita: mensalidade 0 → nasce ATIVA.
  const isFree = input.planValue === 0
  const isPromo =
    !isFree && input.promoMonths !== undefined && input.promoValue !== undefined

  let asaasCustomerId: string | null = null
  let asaasSubscriptionId: string | null = null
  let asaasPromoSubscriptionId: string | null = null
  let invoiceUrl: string | null = null
  let firstPaymentId: string | null = null
  let asaasError: string | null = null

  if (!isFree && process.env.ASAAS_API_KEY) {
    try {
      const customer = await createCustomer({
        name: input.ownerName,
        email: input.ownerEmail,
        cpfCnpj: input.ownerCpfCnpj,
        mobilePhone: input.ownerPhone,
        externalReference: `tenant:${input.slug}`,
      })
      asaasCustomerId = customer.id

      if (isPromo) {
        const result = await createPromoBilling({
          customerId: customer.id,
          slug: input.slug,
          name: input.name,
          planValue: input.planValue,
          promoValue: input.promoValue as number,
          promoMonths: input.promoMonths as number,
          baseDueDate: isoDayPlus(3),
        })
        asaasSubscriptionId = result.regularSubscriptionId
        asaasPromoSubscriptionId = result.promoSubscriptionId
        invoiceUrl = result.invoiceUrl
        firstPaymentId = result.firstPaymentId
      } else {
        const subscription = await createSubscription({
          customer: customer.id,
          billingType: "UNDEFINED",
          value: input.planValue,
          nextDueDate: isoDayPlus(3),
          cycle: "MONTHLY",
          description: `Mensalidade Profissionaliza Mais Brasil — ${input.name}`,
          externalReference: `tenant:${input.slug}`,
        })
        asaasSubscriptionId = subscription.id

        try {
          const payments = await listPayments({ subscription: subscription.id, limit: 1 })
          const firstPayment = payments.data[0] ?? null
          invoiceUrl = firstPayment?.invoiceUrl ?? null
          firstPaymentId = firstPayment?.id ?? null
        } catch {
          // sem invoiceUrl ainda — webhook vai atualizar depois
        }
      }
    } catch (error) {
      asaasError =
        error instanceof AsaasApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Erro Asaas"
    }
  }

  const referralCode = await generateUniqueReferralCode(input.slug)

  const tenant = await prisma.tenant.create({
    data: {
      name: input.name,
      slug: input.slug,
      status: isFree ? "ACTIVE" : "PENDING",
      billingMode: "AUTO",
      planValue: input.planValue,
      asaasCustomerId,
      asaasSubscriptionId,
      asaasPromoSubscriptionId,
      promoValue: isPromo ? input.promoValue : null,
      promoMonths: isPromo ? input.promoMonths : null,
      firstPaymentMaxInstallments: isFree ? 1 : input.firstPaymentMaxInstallments,
      accountManagerId: input.accountManagerId ?? null,
      salesUserId: input.salesUserId ?? null,
      poloName: input.slug,
      referralCode,
      referrerTenantId: input.referrerTenantId ?? null,
      canSellResellers: input.canSellResellers ?? false,
      automationEnabled: input.automationEnabled ?? false,
      ejaEnabled: input.ejaEnabled ?? false,
      ejaUrl: input.ejaEnabled ? (input.ejaUrl ?? null) : null,
      tecnicaEnabled: input.tecnicaEnabled ?? false,
      tecnicaUrl: input.tecnicaEnabled ? (input.tecnicaUrl ?? null) : null,
      updatedAt: new Date(),
    },
    select: { id: true, slug: true, name: true, status: true },
  })

  await logAudit({
    action: "tenant.create",
    resource: "Tenant",
    resourceId: tenant.id,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    actorEmail: input.actor.email ?? undefined,
    tenantId: tenant.id,
    payloadAfter: {
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      planValue: input.planValue,
      referrerTenantId: input.referrerTenantId ?? null,
    },
  })

  // Semeia o TenantPayment PENDING da 1ª mensalidade (fecha a janela de 404 na
  // página /cobranca antes do webhook PAYMENT_CREATED). Best-effort.
  if (firstPaymentId) {
    await prisma.tenantPayment
      .create({
        data: {
          tenantId: tenant.id,
          asaasPaymentId: firstPaymentId,
          amount: isPromo ? (input.promoValue as number) : input.planValue,
          billingType: "UNDEFINED",
          status: "PENDING",
          dueDate: new Date(isoDayPlus(3)),
          invoiceUrl,
        },
      })
      .catch(() => null)
  }

  if (input.automationEnabled) {
    try {
      await prisma.automationMessageTemplate.createMany({
        data: DEFAULT_AUTOMATION_TEMPLATES.map((t) => ({
          tenantId: tenant.id,
          key: t.key,
          body: t.body,
          enabled: true,
        })),
      })
    } catch (err) {
      contextLogger().error(
        { err, event: "resellers.create.automation_templates_failed", tenantId: tenant.id },
        "falha ao criar templates default de automação na criação do revendedor",
      )
    }
  }

  // Bootstrap da vitrine (catálogo + seções da home). Idempotente; não bloqueia.
  try {
    await Promise.all([
      ensureTenantCourses(tenant.id),
      ensureTenantHomeSections(tenant.id),
    ])
  } catch (err) {
    contextLogger().error(
      { err, event: "resellers.create.bootstrap_vitrine_failed", tenantId: tenant.id },
      "bootstrap da vitrine (cursos/seções) falhou na criação do revendedor",
    )
  }

  const user = await prisma.user.create({
    data: {
      email: input.ownerEmail,
      name: input.ownerName,
      role: "RESELLER",
      status: "ATIVO",
      tenantId: tenant.id,
      passwordHash,
      phone: input.ownerPhone ?? null,
      mustChangePassword: true,
      updatedAt: new Date(),
    },
    select: { id: true, email: true },
  })

  // Onboarding com credenciais + link de pagamento. Falha silenciosa sem provedor.
  const baseUrl = appUrl()
  const vitrineUrl = buildVitrineUrl(input.slug)
  let emailSent = false
  let emailError: string | null = null
  try {
    await sendEmail({
      to: input.ownerEmail,
      subject: invoiceUrl
        ? `Sua revenda ${input.name} foi criada — finalize o pagamento`
        : `Sua revenda ${input.name} foi criada`,
      template: {
        type: "reseller-onboarding",
        props: {
          ownerName: input.ownerName,
          resellerName: input.name,
          loginEmail: input.ownerEmail,
          tempPassword,
          loginUrl: `${baseUrl}/login`,
          vitrineUrl,
          paymentUrl: invoiceUrl,
          planValue: input.planValue,
        },
      },
    })
    emailSent = true
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Erro ao enviar email"
    contextLogger().error(
      { err, event: "resellers.create.onboarding_email_failed" },
      "onboarding email do revendedor falhou",
    )
  }

  await createNotification({
    audience: "ROLE",
    roleTarget: "SUPER_ADMIN",
    level: "INFO",
    title: `Novo revendedor: ${input.name}`,
    body: invoiceUrl ? "Aguardando primeiro pagamento." : "Cadastro concluído.",
    category: "tenant",
    href: `/admin/revendedores/${tenant.id}`,
  })
  if (input.accountManagerId) {
    await createNotification({
      audience: "USER",
      userId: input.accountManagerId,
      level: "INFO",
      title: `Você foi atribuído ao revendedor ${input.name}`,
      body: `Slug: ${input.slug} · Plano R$ ${input.planValue.toFixed(2).replace(".", ",")}`,
      category: "tenant",
      href: `/admin/revendedores/${tenant.id}`,
    })
  }

  return {
    ok: true,
    tenant,
    owner: { id: user.id, email: user.email },
    tempPassword: emailSent ? null : tempPassword,
    vitrineUrl,
    asaas: {
      configured: Boolean(process.env.ASAAS_API_KEY),
      customerId: asaasCustomerId,
      subscriptionId: asaasSubscriptionId,
      promoSubscriptionId: asaasPromoSubscriptionId,
      free: isFree,
      invoiceUrl,
      firstPaymentId,
      error: asaasError,
    },
    email: { configured: isEmailConfigured(), sent: emailSent, error: emailError },
  }
}
