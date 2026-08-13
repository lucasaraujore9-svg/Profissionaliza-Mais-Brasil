import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import {
  deletePayment as deleteAsaasPayment,
  cancelSubscription as cancelAsaasSubscription,
  deleteInstallment as deleteAsaasInstallment,
  motherAsaasKey,
  AsaasApiError,
} from "@/lib/asaas/client"
import {
  pmbMaxBoletoInstallments,
  pmbMaxCardInstallments,
} from "@/lib/installments/pmb-rules"
import { issuePmbAsaasCharge } from "@/lib/checkout/issue-pmb-asaas-charge"
import { TenantGatewayIsolationError } from "@/lib/checkout/assert-tenant-gateway"
import { rateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/ratelimit"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { clientIp } from "@/lib/http/client-ip"
import { descreverItemCobranca } from "@/lib/enrollment/multi-course-server"
import { stripCpf } from "@/lib/validation/cpf"
import { swallow } from "@/lib/errors"
import { contextLogger } from "@/lib/logger"
import { withRequestContextParams } from "@/lib/observability/with-request-context"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"

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
  // Parcelamento (cartão/boleto) — validado adiante contra o finalAmount da
  // matrícula (regras: boleto R$50 mín/6 máx; cartão teto do admin).
  installments: z.number().int().min(1).max(12).optional(),
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
        asaasInstallmentId: true,
        boletoInstallments: { select: { id: true }, take: 1 },
        course: { select: { nome: true } },
        // Venda direta com mais de um curso: `course` é só o principal, mas a
        // cobrança é do valor SOMADO. A descrição precisa dos dois.
        bundleCourseIds: true,
        student: { select: PAYER_SELECT },
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
    // Carnê já emitido (parcelas BoletoInstallment existem): não se re-emite a
    // cobrança nem se cria um segundo carnê — a tela /pagar mostra os boletos
    // do carnê em vez do formulário; este guard é a verdade server-side.
    if (
      enrollment.paymentType === "BOLETO_INSTALLMENT" &&
      enrollment.boletoInstallments.length > 0
    ) {
      return NextResponse.json(
        {
          error:
            "Esta compra já tem um carnê de boletos emitido. Acompanhe as parcelas em Meus Pagamentos.",
          code: "CARNE_ALREADY_ISSUED",
        },
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
    // Tentativa anterior de parcelamento no CARTÃO que falhou/não capturou:
    // apaga o plano no Asaas antes de emitir a nova cobrança. (Carnê emitido
    // nunca chega aqui — guard CARNE_ALREADY_ISSUED acima.)
    if (enrollment.asaasInstallmentId) {
      await deleteAsaasInstallment(
        enrollment.asaasInstallmentId,
        motherAsaasKey(),
      ).catch(swallow("pmb-resume.delete_installment"))
      await prisma.enrollment
        .update({
          where: { id: enrollment.id },
          data: { asaasInstallmentId: null },
        })
        .catch(swallow("pmb-resume.clear_installment"))
    }

    const isMonthly = enrollment.paymentType === "MONTHLY"
    const monthlyMonths = isMonthly ? enrollment.installmentsTotal ?? 12 : null

    // ── Validação do parcelamento contra o valor REAL da matrícula ──
    const installmentsChosen = data.installments ?? 1
    if (installmentsChosen > 1) {
      const finalAmount = Number(enrollment.finalAmount)
      if (isMonthly) {
        return NextResponse.json(
          {
            error: "Cursos com mensalidade não aceitam parcelamento adicional",
            code: "INSTALLMENTS_NOT_ALLOWED",
          },
          { status: 400 },
        )
      }
      if (data.paymentMethod === "BOLETO") {
        const cap = pmbMaxBoletoInstallments(finalAmount)
        if (installmentsChosen > cap) {
          return NextResponse.json(
            {
              error:
                cap > 1
                  ? `Para este valor, o boleto pode ser parcelado em até ${cap}x (parcela mínima de R$ 50).`
                  : "Este valor não permite parcelamento no boleto (parcela mínima de R$ 50).",
              code: "INSTALLMENTS_INVALID",
            },
            { status: 400 },
          )
        }
      } else if (data.paymentMethod === "CREDIT_CARD") {
        const cap = pmbMaxCardInstallments(finalAmount)
        if (installmentsChosen > cap) {
          return NextResponse.json(
            {
              error: `Para este valor, o cartão pode ser parcelado em até ${cap}x.`,
              code: "INSTALLMENTS_INVALID",
            },
            { status: 400 },
          )
        }
      } else {
        return NextResponse.json(
          {
            error: "Parcelamento disponível apenas no cartão de crédito ou boleto",
            code: "INSTALLMENTS_INVALID",
          },
          { status: 400 },
        )
      }
    }

    try {
      const result = await issuePmbAsaasCharge({
        enrollmentId: enrollment.id,
        externalReference: `pmb_enr_${enrollment.id}`,
        student: { id: student.id },
        payer: resolvePayer(student),
        // Todos os cursos da compra, não só o primário: a cobrança soma os
        // preços e é este texto que o aluno lê no boleto/extrato.
        courseNome: await descreverItemCobranca(
          enrollment.course.nome,
          enrollment.bundleCourseIds,
        ),
        finalAmount: Number(enrollment.finalAmount),
        isMonthly,
        monthlyMonths,
        billingType: data.paymentMethod,
        installments: installmentsChosen,
        creditCard: data.creditCard,
        creditCardHolder: data.creditCardHolder,
        remoteIp: clientIp(request),
      })

      return NextResponse.json({
        data: { enrollmentId: enrollment.id, gateway: "ASAAS", ...result },
      })
    } catch (error) {
      if (error instanceof TenantGatewayIsolationError) {
        // Matrícula "colapsada": tenantId=null (vitrine PMB) mas o aluno pertence
        // a uma revenda real. O guard recusa cobrá-la na conta-mãe — comportamento
        // CORRETO (evita vazamento de receita). Não é erro do Asaas: devolvemos uma
        // mensagem acionável (refazer pela loja da unidade) em vez de um 502 opaco
        // que prenderia o aluno num loop de retry. A cron fix-gateway-collapse
        // remove a matrícula órfã para a recompra fluir pela conta da revenda.
        contextLogger().warn(
          { event: "pmb_checkout.resume_tenant_mismatch", enrollmentId: enrollment.id },
          "retomada PMB bloqueada: matrícula pertence a uma revenda",
        )
        return NextResponse.json(
          {
            error:
              "Esta cobrança pertence a uma unidade e não pode ser paga por aqui. Refaça a compra pela loja da sua unidade ou entre em contato com o suporte.",
            code: "TENANT_MISMATCH",
          },
          { status: 409 },
        )
      }
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
