import Link from "next/link"
import { OrderSummary } from "@/components/loja/order-summary"
import { MpCheckoutForm } from "@/components/loja/mp-checkout-form"
import { getCurrentTenant } from "@/lib/tenant/current"
import { applyCouponDiscount } from "@/lib/coupons/discount"
import { prisma } from "@/lib/prisma"
import { effectivePaymentType } from "@/lib/tenant/monthly-policy"

interface CheckoutPageProps {
  searchParams: Promise<{
    course_id?: string
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
  const { course_id, coupon: couponParam, error } = await searchParams

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
    where: { id: course_id, tenantId: tenant.id, isVisible: true },
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

  // Public key do MP do revendedor — necessária para montar o checkout
  // transparente no browser. getCurrentTenant não a traz, então buscamos aqui.
  const tenantMp = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { mpPublicKey: true },
  })

  const basePrice = Number(tenantCourse.price)
  // Tipo efetivo na vitrine: se a unidade nao tem parcelado habilitado para a
  // vitrine, MONTHLY cai para ONE_TIME (coerente com /api/loja/checkout).
  const effectiveType = effectivePaymentType(
    tenantCourse.paymentType,
    tenantCourse.tenant,
    "vitrine",
  )
  // Parcelas efetivas da unidade (customParcelas tem prioridade). Para MONTHLY,
  // representa a quantidade de mensalidades. Espelha a hierarquia da vitrine.
  const effectiveParcelas =
    tenantCourse.customParcelas ??
    tenantCourse.course.parcelasOverride ??
    tenantCourse.course.parcelasSugeridas
  const validatedCoupon = couponParam
    ? await resolveCoupon(tenant.id, couponParam, basePrice)
    : null

  const discountAmount = validatedCoupon?.discountAmount ?? 0
  const finalPrice = validatedCoupon?.finalPrice ?? basePrice

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            Finalizar compra
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Preencha seus dados e escolha a forma de pagamento.
          </p>
          {error === "payment_failed" && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Seu pagamento não foi concluído. Tente novamente.
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
          <div className="space-y-6">
            {tenantMp?.mpPublicKey ? (
              <MpCheckoutForm
                publicKey={tenantMp.mpPublicKey}
                courseId={tenantCourse.id}
                couponCode={validatedCoupon?.code ?? null}
              />
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
                Esta loja ainda não concluiu a configuração do pagamento. Tente
                novamente em instantes ou fale com o suporte da loja.
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary
              courseName={tenantCourse.course.nome}
              courseCategory={
                tenantCourse.course.categoriaLoja ??
                tenantCourse.course.categoriaInterna
              }
              courseHours={tenantCourse.course.cargaHoraria}
              basePrice={basePrice}
              discountAmount={discountAmount}
              finalPrice={finalPrice}
              couponCode={validatedCoupon?.code ?? null}
              parcelasSugeridas={effectiveParcelas}
              paymentType={effectiveType}
              monthlyMonths={effectiveParcelas ?? tenantCourse.course.monthlyMonthsMain}
            />
          </aside>
        </div>
      </div>
    </section>
  )
}
