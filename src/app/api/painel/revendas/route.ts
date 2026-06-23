import { NextResponse } from "next/server"
import { z } from "zod"
import { requireResellerSeller } from "@/lib/auth/guards"
import { withRequestContext } from "@/lib/observability/with-request-context"
import { SLUG_REGEX } from "@/lib/tenant/slug"
import { createReseller } from "@/lib/resellers/create"

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
  // Mensalidade que a PMB cobrará da nova revenda (preço do plano PMB).
  planValue: z.number().min(0).max(99999),
  firstPaymentMaxInstallments: z.number().int().min(1).max(12).default(1),
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
