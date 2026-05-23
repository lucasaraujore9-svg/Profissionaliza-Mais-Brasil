import { NextResponse } from "next/server"
import { z } from "zod"
import { payWithCreditCard, getPayment, AsaasApiError } from "@/lib/asaas/client"
import { isKnownAsaasPayment } from "@/lib/asaas/ownership"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"

interface Ctx {
  params: Promise<{ paymentId: string }>
}

const bodySchema = z.object({
  creditCard: z.object({
    holderName: z.string().min(1),
    number: z.string().min(13).max(19),
    expiryMonth: z.string().regex(/^\d{2}$/),
    expiryYear: z.string().regex(/^\d{4}$/),
    ccv: z.string().min(3).max(4),
  }),
  creditCardHolderInfo: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    cpfCnpj: z.string().min(11).max(14),
    postalCode: z.string().min(8).max(9),
    addressNumber: z.string().min(1),
    addressComplement: z.string().optional(),
    phone: z.string().min(10).max(15),
    mobilePhone: z.string().optional(),
  }),
})

export async function POST(request: Request, ctx: Ctx) {
  const rl = await rateLimit(request, RATE_LIMITS.cobrancaPayCard)
  if (!rl.ok) return rateLimitResponse(rl)

  const { paymentId } = await ctx.params

  if (!(await isKnownAsaasPayment(paymentId))) {
    return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  try {
    const payment = await getPayment(paymentId)
    if (payment.status !== "PENDING" && payment.status !== "OVERDUE") {
      return NextResponse.json(
        { error: "Cobrança não está pendente de pagamento" },
        { status: 400 },
      )
    }

    const result = await payWithCreditCard(paymentId, {
      creditCard: {
        ...parsed.data.creditCard,
        number: parsed.data.creditCard.number.replace(/\s/g, ""),
      },
      creditCardHolderInfo: {
        ...parsed.data.creditCardHolderInfo,
        cpfCnpj: parsed.data.creditCardHolderInfo.cpfCnpj.replace(/\D/g, ""),
        postalCode: parsed.data.creditCardHolderInfo.postalCode.replace(/\D/g, ""),
        phone: parsed.data.creditCardHolderInfo.phone.replace(/\D/g, ""),
        mobilePhone: parsed.data.creditCardHolderInfo.mobilePhone?.replace(/\D/g, ""),
      },
    })

    return NextResponse.json({
      data: {
        id: result.id,
        status: result.status,
        value: result.value,
      },
    })
  } catch (error) {
    if (error instanceof AsaasApiError) {
      if (error.statusCode === 404) {
        return NextResponse.json({ error: "Cobrança não encontrada" }, { status: 404 })
      }
      const msg = error.errors?.[0]?.description ?? error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: "Erro ao processar pagamento" }, { status: 502 })
  }
}
