import Link from "next/link"
import { CheckoutPanel } from "@/components/loja/checkout-panel"
import { CheckoutInquiryForm } from "@/components/loja/checkout-inquiry-form"
import { getCurrentTenant } from "@/lib/tenant/current"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { prisma } from "@/lib/prisma"
import { effectivePaymentType } from "@/lib/tenant/monthly-policy"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import { getPackageForCheckout } from "@/lib/packages/vitrine"
import {
  MAX_CARD_INSTALLMENTS,
  displayInterestFreeInstallments,
} from "@/lib/mercadopago/installments"

interface CheckoutPageProps {
  searchParams: Promise<{
    course_id?: string
    package_id?: string
    coupon?: string
    error?: string
  }>
}

async function resolveCoupon(
  tenantId: string,
  code: string,
  basePrice: number,
): Promise<{
  code: string
  discountAmount: number
  finalPrice: number
} | null> {
  const now = new Date()
  const coupon = await prisma.coupon.findFirst({
    where: {
      tenantId,
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
  })
  if (!coupon) return null
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return null

  // Usa o helper central (Prisma.Decimal + half-even) para que o PREVIEW bata
  // exatamente com o valor recalculado/cobrado no checkout — evita drift de
  // arredondamento (float) entre o que o aluno vê e o que e cobrado.
  const { discountAmount, finalAmount } = applyCouponDiscount({
    basePrice,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
  })

  return {
    code: coupon.code,
    discountAmount,
    finalPrice: finalAmount,
  }
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const tenant = await getCurrentTenant()
  const { course_id, package_id, coupon: couponParam, error } = await searchParams

  if (!tenant) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Checkout indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Não conseguimos identificar esta loja.
        </p>
      </div>
    )
  }

  // Defesa em profundidade: o proxy já reescreve vitrines não-ativas para
  // /loja/suspended, e as APIs de checkout recusam a venda (TENANT_INACTIVE).
  // Mesmo assim bloqueamos a renderização do formulário aqui — caso o aluno
  // chegue por link direto com cache de tenant defasado.
  if (tenant.status !== "ACTIVE") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Loja indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Esta loja não está disponível para compras no momento.
        </p>
      </div>
    )
  }

  // ── Checkout de PACOTE ────────────────────────────────────────────────────
  if (package_id) {
    const pkg = await getPackageForCheckout(tenant.id, package_id)
    if (!pkg) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
            Pacote indisponível
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            Este pacote não está mais disponível nesta loja.
          </p>
        </div>
      )
    }

    const tenantGateway = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: {
        mpAccessToken: true,
        mpPublicKey: true,
        salesGateway: true,
        asaasConnected: true,
        interestFreeInstallments: true,
      },
    })
    const checkoutMode = tenantCheckoutMode({
      salesGateway: tenantGateway?.salesGateway,
      asaasConnected: tenantGateway?.asaasConnected,
      mpAccessToken: tenantGateway?.mpAccessToken,
      mpPublicKey: tenantGateway?.mpPublicKey,
    })

    const validatedCoupon = couponParam
      ? await resolveCoupon(tenant.id, couponParam, pkg.price)
      : null
    const pkgMpPublicKey = tenantGateway?.mpPublicKey ?? null
    // Sem gateway conectado a loja não cobra — mas o cupom dela continua valendo.
    // O painel mostra o campo de cupom em qualquer caso: sobrando saldo a pagar
    // cai no formulário de contato (o que a vitrine já fazia); com cupom de 100%
    // vira matrícula gratuita, liberada na hora como bolsa.
    const pkgPanelForm =
      checkoutMode === "ASAAS"
        ? ({ kind: "asaas", initPath: "/api/loja/checkout/package" } as const)
        : checkoutMode === "MP" && pkgMpPublicKey
          ? ({
              kind: "mp",
              publicKey: pkgMpPublicKey,
              initPath: "/api/loja/checkout/package",
              maxInstallments: MAX_CARD_INSTALLMENTS,
              interestFreeInstallments: tenantGateway?.interestFreeInstallments ?? 1,
            } as const)
          : ({
              kind: "free",
              initPath: "/api/loja/checkout/package",
              inquiry: (
                <CheckoutInquiryForm
                  packageId={pkg.id}
                  courseName={`Pacote: ${pkg.name}`}
                  escolaName={tenant.name}
                />
              ),
            } as const)

    return (
      <section className="bg-[#FAFAFA] py-10 md:py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
              {checkoutMode === "NONE" ? "Finalizar matrícula" : "Finalizar compra"}
            </h1>
            {/* Texto que serve aos DOIS estados da loja sem gateway: o cupom é
                aplicado no cliente e pode zerar o valor depois desta renderização. */}
            <p className="mt-1 text-sm text-gray-600">
              {checkoutMode === "NONE"
                ? "Tem um cupom de desconto? Aplique abaixo. Sem cupom, deixe seus dados que a escola entra em contato para concluir sua matrícula."
                : "Preencha seus dados e escolha a forma de pagamento."}
            </p>
          </header>

          <CheckoutPanel
            target={{ packageId: pkg.id }}
            couponScope={{ kind: "tenant", tenantId: tenant.id }}
            basePrice={pkg.price}
            initialCoupon={validatedCoupon}
            form={pkgPanelForm}
            summary={{
              courseName: pkg.name,
              courseCategory: `Pacote • ${pkg.courses.length} ${pkg.courses.length === 1 ? "curso" : "cursos"}`,
              courseHours: null,
              courseImageUrl: null,
              basePrice: pkg.price,
              parcelasSugeridas: null,
              paymentType: "ONE_TIME",
            }}
          />
        </div>
      </section>
    )
  }

  if (!course_id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Selecione um curso
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Escolha um curso na vitrine para prosseguir com o checkout.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          Voltar para a loja
        </Link>
      </div>
    )
  }

  const tenantCourse = await prisma.tenantCourse.findFirst({
    // course.status="ATIVO": curso desativado/removido na origem nao renderiza checkout.
    where: { id: course_id, tenantId: tenant.id, isVisible: true, course: { status: "ATIVO" } },
    include: {
      course: {
        select: {
          nome: true,
          cargaHoraria: true,
          categoriaLoja: true,
          categoriaInterna: true,
          parcelasSugeridas: true,
          parcelasOverride: true,
          monthlyMonthsMain: true,
          capaOverride: true,
          capaImageUrl: true,
        },
      },
      tenant: {
        select: {
          monthlyAllowed: true,
          monthlyEnabled: true,
          monthlyScope: true,
        },
      },
    },
  })

  if (!tenantCourse) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Curso indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Este curso não está mais disponível nesta loja.
        </p>
      </div>
    )
  }

  // Gateway de vendas da unidade + credenciais públicas necessárias para montar
  // o checkout. getCurrentTenant não as traz, então buscamos aqui.
  const tenantGateway = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      mpAccessToken: true,
      mpPublicKey: true,
      salesGateway: true,
      asaasConnected: true,
      interestFreeInstallments: true,
    },
  })

  // Gateway efetivo da unidade via helper central (mesma regra do
  // /api/loja/checkout). MP | ASAAS | NONE. Não buscamos o asaas_webhook_token
  // (segredo) neste server component público: marcar salesGateway=ASAAS já exige
  // api key + token (rota sales-gateway), e desconectar reverte para MP —
  // então salesGateway==="ASAAS" implica o token presente. A checagem
  // autoritativa (com o token) acontece em /api/loja/checkout antes de cobrar.
  const checkoutMode = tenantCheckoutMode({
    salesGateway: tenantGateway?.salesGateway,
    asaasConnected: tenantGateway?.asaasConnected,
    mpAccessToken: tenantGateway?.mpAccessToken,
    mpPublicKey: tenantGateway?.mpPublicKey,
  })

  const basePrice = Number(tenantCourse.price)
  // Tipo efetivo na vitrine: se a unidade nao tem parcelado habilitado para a
  // vitrine, MONTHLY cai para ONE_TIME (coerente com /api/loja/checkout).
  const effectiveType = effectivePaymentType(
    tenantCourse.paymentType,
    tenantCourse.tenant,
    "vitrine",
  )
  // Quantidade de mensalidades da unidade (customParcelas tem prioridade) — só
  // usada quando MONTHLY. Em pagamento único o "Nx sem juros" vem do nº global.
  const effectiveParcelas =
    tenantCourse.customParcelas ??
    tenantCourse.course.parcelasOverride ??
    tenantCourse.course.parcelasSugeridas
  // Pagamento único: nº GLOBAL de parcelas sem juros da unidade (fonte do resumo).
  const oneTimeParcelas = displayInterestFreeInstallments(
    tenantGateway?.interestFreeInstallments ?? 1,
  )
  const validatedCoupon = couponParam
    ? await resolveCoupon(tenant.id, couponParam, basePrice)
    : null

  const courseMpPublicKey = tenantGateway?.mpPublicKey ?? null
  // Sem gateway conectado a loja não cobra — mas o cupom dela continua valendo.
  // O painel mostra o campo de cupom em qualquer caso: sobrando saldo a pagar
  // cai no formulário de contato (o que a vitrine já fazia); com cupom de 100%
  // vira matrícula gratuita, liberada na hora como bolsa.
  const coursePanelForm =
    checkoutMode === "ASAAS"
      ? ({ kind: "asaas" } as const)
      : checkoutMode === "MP" && courseMpPublicKey
        ? ({
            kind: "mp",
            publicKey: courseMpPublicKey,
            // Mensal = recorrência (1 cobrança/mês); à vista parcela até 12x.
            maxInstallments: effectiveType === "MONTHLY" ? 1 : MAX_CARD_INSTALLMENTS,
            interestFreeInstallments: tenantGateway?.interestFreeInstallments ?? 1,
          } as const)
        : ({
            kind: "free",
            inquiry: (
              /* Unidade sem gateway próprio: NUNCA cai no checkout do sistema
                 mãe. Captura o interesse (e-mail p/ a revenda + lead). */
              <CheckoutInquiryForm
                courseId={tenantCourse.id}
                courseName={tenantCourse.course.nome}
                escolaName={tenant.name}
              />
            ),
          } as const)

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            {checkoutMode === "NONE" ? "Finalizar matrícula" : "Finalizar compra"}
          </h1>
          {/* Texto que serve aos DOIS estados da loja sem gateway: o cupom é
              aplicado no cliente e pode zerar o valor depois desta renderização. */}
          <p className="mt-1 text-sm text-gray-600">
            {checkoutMode === "NONE"
              ? "Tem um cupom de desconto? Aplique abaixo. Sem cupom, deixe seus dados que a escola entra em contato para concluir sua matrícula."
              : "Preencha seus dados e escolha a forma de pagamento."}
          </p>
          {error === "payment_failed" && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Seu pagamento não foi concluído. Tente novamente.
            </div>
          )}
        </header>

        <CheckoutPanel
          target={{ courseId: tenantCourse.id }}
          couponScope={{ kind: "tenant", tenantId: tenant.id }}
          basePrice={basePrice}
          initialCoupon={validatedCoupon}
          form={coursePanelForm}
          summary={{
            courseName: tenantCourse.course.nome,
            courseCategory:
              tenantCourse.course.categoriaLoja ??
              tenantCourse.course.categoriaInterna,
            courseHours: tenantCourse.course.cargaHoraria,
            courseImageUrl:
              tenantCourse.customCapaUrl ??
              tenantCourse.course.capaOverride ??
              tenantCourse.course.capaImageUrl,
            basePrice,
            parcelasSugeridas:
              effectiveType === "MONTHLY" ? effectiveParcelas : oneTimeParcelas,
            paymentType: effectiveType,
            monthlyMonths:
              effectiveParcelas ?? tenantCourse.course.monthlyMonthsMain,
          }}
        />
      </div>
    </section>
  )
}
