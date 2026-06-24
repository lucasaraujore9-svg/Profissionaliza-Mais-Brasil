import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  deletePayment as deleteAsaasPayment,
  cancelSubscription as cancelAsaasSubscription,
  AsaasApiError,
} from "@/lib/asaas/client"
import { issuePmbAsaasCharge } from "@/lib/checkout/issue-pmb-asaas-charge"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { clientIp } from "@/lib/http/client-ip"
import { stripCpf } from "@/lib/validation/cpf"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"

// Cartão: mesmo schema do checkout público (/api/checkout).
const creditCardSchema = z.object({
  holderName: z.string().trim().min(3).max(160),
  number: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 13 && v.length <= 19, "Número do cartão inválido"),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, "Mês inválido"),
  expiryYear: z
    .string()
    .regex(/^\d{2}(\d{2})?$/, "Ano inválido")
    .transform((v) => (v.length === 2 ? `20${v}` : v)),
  ccv: z.string().regex(/^\d{3,4}$/, "CCV inválido"),
})

const creditCardHolderSchema = z.object({
  postalCode: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8, "CEP inválido"),
  addressNumber: z.string().trim().min(1).max(20),
  addressComplement: z.string().trim().max(60).optional(),
})

// Retomada de cobrança: o aluno/preço/cupom já estão na matrícula — só pedimos
// o método (e o cartão, quando for o caso). Dados do comprador vêm do banco.
const bodySchema = z.object({
  paymentMethod: z.enum(["PIX", "BOLETO", "CREDIT_CARD"]),
  creditCard: creditCardSchema.optional(),
  creditCardHolder: creditCardHolderSchema.optional(),
  acceptedTerms: z.literal(true, {
    message: "É necessário aceitar os Termos de Uso e a Política de Privacidade",
  }),
})

// POST /api/checkout/enrollment/[id] — emite (ou re-emite) a cobrança Asaas do
// sistema-mãe (PMB) para uma matrícula PENDENTE JÁ EXISTENTE, na tela /pagar/[id].
// NÃO cria matrícula nova (preserva vendedor/preço/cupom da venda direta) e usa
// os dados do aluno do banco — o corpo só traz o método e o cartão.
export const POST = withRequestContextParams<{ id: string }>(
  { action: "pmb.checkout.resume", route: "/api/checkout/enrollment/[id]" },
  async (request: Request, { params }) => {
    // Mesmo guard de host do checkout público: cobra na conta da PMB; só pode
    // ser acionado a partir do domínio PMB.
    if (!isPmbAppHost(request.headers.get("host"))) {
      return NextResponse.json(
        { error: "Checkout indisponível neste domínio", code: "WRONG_HOST" },
        { status: 404 },
      )
    }

    const rl = await rateLimit(request, RATE_LIMITS.publicCheckout)
    if (!rl.ok) return rateLimitResponse(rl)

    const { id } = await params

    let payload: unknown
    try {
      payload = await request.json()
    } catch {
      return NextResponse.json(
        { error: "JSON inválido", code: "INVALID_JSON" },
        { status: 400 },
      )
    }
    const parsed = bodySchema.safeParse(payload)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Dados inválidos",
          code: "VALIDATION_ERROR",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }
    const data = parsed.data

    if (data.paymentMethod === "CREDIT_CARD" && (!data.creditCard || !data.creditCardHolder)) {
      return NextResponse.json(
        { error: "Dados do cartão obrigatórios", code: "CREDIT_CARD_REQUIRED" },
        { status: 400 },
      )
    }

    // Só matrícula da vitrine PMB (tenantId=null), PENDENTE e via Asaas.
    const enrollment = await prisma.enrollment.findFirst({
      where: { id, tenantId: null, gateway: "ASAAS" },
      select: {
        id: true,
        status: true,
        finalAmount: true,
        paymentType: true,
        installmentsTotal: true,
        asaasPaymentId: true,
        asaasSubscriptionId: true,
        course: { select: { nome: true } },
        student: {
          select: {
            id: true,
            nome: true,
            email: true,
            cpf: true,
            fone: true,
            asaasCustomerId: true,
          },
        },
      },
    })

    if (!enrollment) {
      return NextResponse.json(
        { error: "Cobrança não encontrada", code: "ENROLLMENT_NOT_FOUND" },
        { status: 404 },
      )
    }
    if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Esta matrícula já está paga", code: "ALREADY_PAID" },
        { status: 409 },
      )
    }
    if (enrollment.status !== "PENDING") {
      return NextResponse.json(
        { error: "Cobrança indisponível", code: "ENROLLMENT_NOT_PENDING" },
        { status: 409 },
      )
    }

    const { student } = enrollment
    const cpf = student.cpf ? stripCpf(student.cpf) : null
    if (!student.email || !cpf || !student.fone) {
      return NextResponse.json(
        {
          error: "Cadastro do aluno incompleto (e-mail, CPF e telefone). Contate o suporte.",
          code: "STUDENT_INCOMPLETE",
        },
        { status: 400 },
      )
    }

    const missing = [
      !process.env.ASAAS_API_URL && "ASAAS_API_URL",
      !process.env.ASAAS_API_KEY && "ASAAS_API_KEY",
    ].filter(Boolean) as string[]
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Asaas não configurado: faltam ${missing.join(", ")}`, code: "ASAAS_NOT_CONFIGURED" },
        { status: 503 },
      )
    }

    // Troca de método / re-emissão: cancela a cobrança anterior (criada na venda
    // direta ou numa tentativa anterior) para não deixar duas em aberto. Mesma
    // política do checkout público ao trocar de forma de pagamento.
    if (enrollment.asaasSubscriptionId) {
      await cancelAsaasSubscription(enrollment.asaasSubscriptionId).catch(
        swallow("pmb-resume.cancel_subscription"),
      )
    }
    if (enrollment.asaasPaymentId) {
      await deleteAsaasPayment(enrollment.asaasPaymentId).catch(
        swallow("pmb-resume.delete_payment"),
      )
    }

    const isMonthly = enrollment.paymentType === "MONTHLY"
    const monthlyMonths = isMonthly ? enrollment.installmentsTotal ?? 12 : null

    try {
      const result = await issuePmbAsaasCharge({
        enrollmentId: enrollment.id,
        externalReference: `pmb_enr_${enrollment.id}`,
        student: {
          id: student.id,
          nome: student.nome,
          email: student.email,
          cpf,
          fone: student.fone,
          asaasCustomerId: student.asaasCustomerId,
        },
        courseNome: enrollment.course.nome,
        finalAmount: Number(enrollment.finalAmount),
        isMonthly,
        monthlyMonths,
        billingType: data.paymentMethod,
        creditCard: data.creditCard,
        creditCardHolder: data.creditCardHolder,
        remoteIp: clientIp(request),
      })

      return NextResponse.json({
        data: { enrollmentId: enrollment.id, gateway: "ASAAS", ...result },
      })
    } catch (error) {
      // NÃO apagamos a matrícula (diferente do checkout público): ela é uma venda
      // direta legítima e o aluno pode tentar de novo. Só reportamos o erro.
      contextLogger().error(
        { err: error, event: "pmb_checkout.resume_failed", enrollmentId: enrollment.id },
        "retomada de cobrança PMB falhou",
      )
      const message =
        error instanceof AsaasApiError ? error.message : "Falha ao gerar cobrança no Asaas"
      return NextResponse.json(
        { error: message, code: "ASAAS_ERROR" },
        { status: 502 },
      )
    }
  },
)
