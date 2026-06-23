import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireResellerSeller } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { SLUG_REGEX } from "@/lib/tenant/slug"
import { createReseller } from "@/lib/resellers/create"
import { isAllowedResellerPlan, planEnablesAutomation } from "@/lib/resellers/plans"

// POST /api/painel/revendas — o revendedor-vendedor cria uma SUB-REVENDA.
// A cobrança vai SEMPRE para o Asaas da PMB (sistema mãe) e a nova unidade é
// atrelada à unidade vendedora via referrerTenantId — que passa a ganhar a
// comissão de indicação recorrente e a poder dar suporte/impersonar.
const createSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(3)
    .max(32)
    .toLowerCase()
    .regex(SLUG_REGEX, "Use apenas letras, números e hífen"),
  ownerName: z.string().min(2).max(80),
  ownerEmail: z.string().email().toLowerCase(),
  ownerCpfCnpj: z.string().min(11).max(20),
  ownerPhone: z.string().min(8).max(20).optional(),
  // Mensalidade da sub-revenda: SÓ os planos permitidos (209 ou 239). O vendedor
  // NUNCA cria revenda gratuita — qualquer outro valor (inclusive 0) é rejeitado.
  planValue: z
    .number()
    .refine(isAllowedResellerPlan, "Escolha o plano Profissionaliza (R$ 209) ou PRO (R$ 239)."),
  firstPaymentMaxInstallments: z.number().int().min(1).max(12).default(1),
  // Lead de revenda sendo convertido (opcional) — marcado CONVERTED ao criar.
  leadId: z.string().min(1).optional(),
})

export const POST = withRequestContext(
  { action: "painel.revendas.create", route: "/api/painel/revendas" },
  async (request: Request) => {
    const guard = await requireResellerSeller()
    if (!guard.ok) return guard.response
    const sellerTenantId = guard.tenantId

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
    }
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }
    const data = parsed.data

    const result = await createReseller({
      name: data.name,
      slug: data.slug,
      ownerName: data.ownerName,
      ownerEmail: data.ownerEmail,
      ownerCpfCnpj: data.ownerCpfCnpj,
      ownerPhone: data.ownerPhone,
      planValue: data.planValue,
      firstPaymentMaxInstallments: data.firstPaymentMaxInstallments,
      // PRO (239) já habilita o módulo de Automação na criação.
      automationEnabled: planEnablesAutomation(data.planValue),
      // Atribuição FORÇADA à unidade vendedora; sem vendedor PMB nem gerente; a
      // sub-revenda não herda o módulo de revender revendas.
      referrerTenantId: sellerTenantId,
      salesUserId: null,
      accountManagerId: null,
      canSellResellers: false,
      actor: { userId: guard.session.userId, role: guard.session.role },
    })

    if (!result.ok) {
      return NextResponse.json(
        result.fields
          ? { error: result.error, fields: result.fields }
          : { error: result.error },
        { status: result.status },
      )
    }

    // Conversão de lead: marca CONVERTED e liga ao tenant criado. Escopado por
    // referrerTenantId — o vendedor só converte leads atribuídos ao código dele.
    // Best-effort: a revenda já foi criada, não derruba a resposta se falhar.
    if (data.leadId) {
      await prisma.lead
        .updateMany({
          where: { id: data.leadId, referrerTenantId: sellerTenantId },
          data: { status: "CONVERTED", tenantId: result.tenant.id },
        })
        .catch(() => null)
    }

    return NextResponse.json({
      data: {
        tenant: result.tenant,
        owner: result.owner,
        tempPassword: result.tempPassword,
        vitrineUrl: result.vitrineUrl,
        asaas: result.asaas,
        email: result.email,
      },
    })
  },
)
