/**
 * Pagamento da linha da vez do parcelado pela página pública (loja e PMB).
 * As rotas só resolvem o tenant e passam pelo BotID; o resto mora aqui.
 *
 * O servidor recalcula a oferta (`flexOffer`): o método do form só vale se a
 * linha pedida é a da vez e o meio está entre os oferecidos. O contrato de
 * entrada e saída é o mesmo de /api/loja/checkout/process, então os formulários
 * de checkout (Asaas e MP) postam e leem a resposta sem mudança.
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { asaasFormDataSchema, buildCardPair } from "@/lib/asaas/transparent-process"
import { transparentFormDataSchema } from "@/lib/mercadopago/transparent-process"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { contextLogger } from "@/lib/logger"
import { MP_BOLETO_METHOD_ID } from "./schedule"
import { flexOffer, type FlexMethod } from "./flex"
import { chargeFlexRow, type FlexCardInput, type FlexChargeResult, type FlexPayer } from "./flex-charge"
import { startFlexCardSubscription } from "./flex-card"
import type { BoletoAddress } from "./mp-boleto"

const err = (httpStatus: number, code: string, error: string): FlexChargeResult =>
  ({ kind: "error", httpStatus, code, error })

/** Parcelas seguintes se pagam com a matrícula ativa (ou suspensa pela parcela atrasada). */
const PAYABLE_STATUSES = new Set(["PENDING", "ACTIVE", "SUSPENDED"])

export async function payFlexRow(
  input: {
    enrollmentId: string
    /** null = vitrine PMB. */
    tenantId: string | null
    rowId: string
    method: FlexMethod
    payer: FlexPayer
    card?: FlexCardInput
  },
  now: Date = new Date(),
): Promise<FlexChargeResult> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: input.enrollmentId, tenantId: input.tenantId },
    select: {
      status: true,
      flexInstallments: true,
      flexHasDownPayment: true,
      installmentMethod: true,
      asaasSubscriptionId: true,
      mpSubscriptionId: true,
      tenant: { select: { status: true } },
      boletoInstallments: { select: { id: true, number: true, status: true, dueDate: true, cardDeclinedAt: true } },
    },
  })
  if (!enrollment?.flexInstallments) return err(404, "NOT_FOUND", "Matrícula não encontrada")
  if (enrollment.tenant && enrollment.tenant.status !== "ACTIVE") {
    return err(403, "TENANT_INACTIVE", "Loja indisponível para pagamento")
  }
  if (!PAYABLE_STATUSES.has(enrollment.status)) {
    return err(409, "INVALID_STATE", "Esta matrícula não pode ser paga")
  }
  const row = enrollment.boletoInstallments.find((r) => r.id === input.rowId)
  if (!row) return err(404, "INSTALLMENT_NOT_FOUND", "Parcela não encontrada")

  const offer = flexOffer(
    {
      hasDownPayment: enrollment.flexHasDownPayment,
      method: enrollment.installmentMethod,
      subscriptionActive: !!(enrollment.asaasSubscriptionId || enrollment.mpSubscriptionId),
      rows: enrollment.boletoInstallments,
    },
    now,
  )
  if (offer.kind !== "pay" || offer.rowNumber !== row.number || !offer.methods.includes(input.method)) {
    return err(409, "METHOD_NOT_OFFERED", "Este meio de pagamento não está disponível para esta parcela")
  }

  if (input.method === "CREDIT_CARD") {
    if (!input.card) return err(400, "CARD_REQUIRED", "Dados do cartão ausentes")
    // "single" = entrada (1x avulsa); "subscription" = cartão nas linhas restantes.
    return offer.card === "subscription"
      ? startFlexCardSubscription({
          enrollmentId: input.enrollmentId,
          fromRowNumber: offer.rowNumber,
          payer: input.payer,
          card: input.card,
        })
      : chargeFlexRow({ rowId: input.rowId, method: "CREDIT_CARD", payer: input.payer, card: input.card })
  }

  const result = await chargeFlexRow({ rowId: input.rowId, method: input.method, payer: input.payer })
  // Os três meios fora da entrada = meio ainda não escolhido ou cartão negado:
  // o meio usado agora passa a valer para as próximas (a entrada NÃO define).
  // Só depois que a cobrança nova existe: pedido recusado não troca o plano.
  const charged = result.kind === "approved" || (result.kind === "pending" && !!(result.pix || result.boleto))
  if (offer.card === "subscription" && charged) {
    await prisma.enrollment.update({ where: { id: input.enrollmentId }, data: { installmentMethod: input.method } })
  }
  return result
}

// ── Rotas ────────────────────────────────────────────────────────────────────

/** O mesmo corpo que os formulários mandam para /api/loja/checkout/process. */
const bodySchema = z.object({
  enrollmentId: z.string().min(1),
  boletoInstallmentId: z.string().min(1),
  formData: z.unknown(),
})

const MP_BOLETO_IDS = new Set([MP_BOLETO_METHOD_ID, "pec"])

type Mapped = { method: FlexMethod; card?: FlexCardInput; address?: BoletoAddress }

function fromAsaasForm(raw: unknown, payer: ReturnType<typeof resolvePayer>): Mapped | null {
  const parsed = asaasFormDataSchema.safeParse(raw)
  if (!parsed.success) return null
  const { method } = parsed.data
  if (method !== "CREDIT_CARD") return { method }
  const pair = buildCardPair(parsed.data, {
    payerCpf: payer.cpf,
    payerFone: payer.fone,
    payerNome: payer.nome,
    payerEmail: payer.email,
  })
  return { method, card: pair ? { gateway: "ASAAS", ...pair } : undefined }
}

function fromMpForm(raw: unknown): Mapped | null {
  const parsed = transparentFormDataSchema.safeParse(raw)
  if (!parsed.success) return null
  const f = parsed.data
  if (f.payment_method_id === "pix") return { method: "PIX" }
  if (MP_BOLETO_IDS.has(f.payment_method_id)) {
    const a = f.payer?.address
    return {
      method: "BOLETO",
      address: a && {
        cep: a.zip_code ?? null,
        rua: a.street_name ?? null,
        numero: a.street_number !== undefined ? String(a.street_number) : null,
        bairro: a.neighborhood ?? null,
        cidade: a.city ?? null,
        estado: a.federal_unit ?? null,
      },
    }
  }
  return {
    method: "CREDIT_CARD",
    card: f.token
      ? {
          gateway: "MP",
          token: f.token,
          paymentMethodId: f.payment_method_id,
          ...(f.issuer_id !== undefined ? { issuerId: String(f.issuer_id) } : {}),
        }
      : undefined,
  }
}

/** Mesmo critério da rota da loja; o 0.0.0.0 final fica no client Asaas. */
function remoteIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    null
  )
}

function toResponse(result: FlexChargeResult): Response {
  if (result.kind === "error") {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.httpStatus })
  }
  if (result.kind === "approved") return NextResponse.json({ data: { status: "approved" } })
  return NextResponse.json({ data: { status: "pending", pix: result.pix, boleto: result.boleto } })
}

/** Corpo do POST das duas rotas, já com tenant resolvido e BotID conferido. */
export async function flexPayResponse(request: Request, tenantId: string | null): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido", code: "INVALID_JSON" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", code: "VALIDATION_ERROR" }, { status: 400 })
  }
  const { enrollmentId, boletoInstallmentId: rowId, formData } = parsed.data

  try {
    const enrollment = await prisma.enrollment.findFirst({
      where: { id: enrollmentId, tenantId },
      select: {
        student: { select: PAYER_SELECT },
        boletoInstallments: { where: { id: rowId }, select: { gateway: true } },
      },
    })
    const row = enrollment?.boletoInstallments[0]
    if (!enrollment || !row) {
      return NextResponse.json({ error: "Parcela não encontrada", code: "NOT_FOUND" }, { status: 404 })
    }
    // Quem PAGA: com aluno menor, o responsável financeiro (dados do banco, não do form).
    const p = resolvePayer(enrollment.student)
    const mapped = row.gateway === "ASAAS" ? fromAsaasForm(formData, p) : fromMpForm(formData)
    if (!mapped) {
      return NextResponse.json({ error: "Dados de pagamento inválidos", code: "VALIDATION_ERROR" }, { status: 400 })
    }
    const payer: FlexPayer = {
      nome: p.nome,
      email: p.email,
      cpf: p.cpf,
      phone: p.fone,
      remoteIp: remoteIp(request),
      ...(mapped.address ? { address: mapped.address } : {}),
    }
    return toResponse(
      await payFlexRow({ enrollmentId, tenantId, rowId, method: mapped.method, payer, card: mapped.card }),
    )
  } catch (error) {
    contextLogger().error(
      { err: error, event: "flex.pay_failed", enrollmentId, rowId },
      "pagamento da parcela falhou",
    )
    return NextResponse.json({ error: "Erro ao processar o pagamento", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}

/** Polling dos formulários: `?enrollment_id=…&installment_id=…` → `data.paid` da linha. */
export async function flexRowStatusResponse(request: Request, tenantId: string | null): Promise<Response> {
  const url = new URL(request.url)
  const enrollmentId = url.searchParams.get("enrollment_id")
  const installmentId = url.searchParams.get("installment_id")
  if (!enrollmentId || !installmentId) {
    return NextResponse.json(
      { error: "enrollment_id e installment_id obrigatórios", code: "MISSING_ID" },
      { status: 400 },
    )
  }
  const row = await prisma.boletoInstallment.findFirst({
    where: { id: installmentId, enrollmentId, enrollment: { tenantId } },
    select: { id: true, status: true },
  })
  if (!row) {
    return NextResponse.json({ error: "Parcela não encontrada", code: "INSTALLMENT_NOT_FOUND" }, { status: 404 })
  }
  return NextResponse.json({
    data: { enrollmentId, installmentId: row.id, status: row.status, paid: row.status === "PAID" },
  })
}

/** Tenant da loja pelos headers do proxy (id; senão slug). null = não identificada. */
export async function lojaTenantId(request: Request): Promise<string | null> {
  const id = request.headers.get("x-tenant-id")
  if (id) return id
  const slug = request.headers.get("x-tenant-slug")
  if (!slug) return null
  const t = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
  return t?.id ?? null
}
