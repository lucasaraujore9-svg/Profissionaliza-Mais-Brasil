import Link from "next/link"
import { OrderSummary } from "@/components/loja/order-summary"
import { PmbCheckoutForm } from "@/components/loja/pmb-checkout-form"
import { prisma } from "@/lib/prisma"

interface CheckoutPageProps {
  searchParams: Promise<{
    course_id?: string
    slug?: string
    coupon?: string
    error?: string
  }>
}

async function resolveCoupon(
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
      tenantId: null,
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
  })
  if (!coupon) return null
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return null

  const raw =
    coupon.discountType === "PERCENTAGE"
      ? (basePrice * Number(coupon.discountValue)) / 100
      : Number(coupon.discountValue)
  const discountAmount = Math.min(raw, basePrice)

  return {
    code: coupon.code,
    discountAmount: Number(discountAmount.toFixed(2)),
    finalPrice: Number((basePrice - discountAmount).toFixed(2)),
  }
}

export default async function CheckoutPage({ searchParams }: CheckoutPageProps) {
  const { course_id, slug, coupon: couponParam, error } = await searchParams

  const identifier = course_id ?? slug
  if (!identifier) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Selecione um curso
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Escolha um curso no catálogo para prosseguir com o checkout.
        </p>
        <Link
          href="/cursos"
          className="mt-6 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-900)]"
        >
          Ver catálogo
        </Link>
      </div>
    )
  }

  const course = await prisma.course.findFirst({
    where: course_id
      ? { id: identifier, status: "ATIVO", hiddenMain: false }
      : { slug: identifier, status: "ATIVO", hiddenMain: false },
    select: {
      id: true,
      nome: true,
      slug: true,
      cargaHoraria: true,
      categoriaLoja: true,
      categoriaInterna: true,
      parcelasSugeridas: true,
      precoVitrineMain: true,
      precoPromocional: true,
      precoOriginal: true,
      paymentTypeMain: true,
      monthlyMonthsMain: true,
    },
  })

  if (!course) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Curso indisponível
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Este curso não está mais disponível para compra direta.
        </p>
        <Link
          href="/cursos"
          className="mt-6 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-900)]"
        >
          Ver outros cursos
        </Link>
      </div>
    )
  }

  const basePrice = Number(
    course.precoVitrineMain ??
      course.precoPromocional ??
      course.precoOriginal ??
      0,
  )

  if (basePrice <= 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
          Curso sem preço configurado
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Entre em contato com nossa equipe para concluir sua matrícula.
        </p>
        <Link
          href={`/contato?curso=${encodeURIComponent(course.slug)}`}
          className="mt-6 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-900)]"
        >
          Falar com a equipe
        </Link>
      </div>
    )
  }

  const validatedCoupon = couponParam
    ? await resolveCoupon(couponParam, basePrice)
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
            <PmbCheckoutForm
              courseId={course.id}
              couponCode={validatedCoupon?.code ?? null}
            />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary
              courseName={course.nome}
              courseCategory={course.categoriaLoja ?? course.categoriaInterna}
              courseHours={course.cargaHoraria}
              basePrice={basePrice}
              discountAmount={discountAmount}
              finalPrice={finalPrice}
              couponCode={validatedCoupon?.code ?? null}
              parcelasSugeridas={course.parcelasSugeridas}
              paymentType={course.paymentTypeMain}
              monthlyMonths={course.monthlyMonthsMain}
            />
          </aside>
        </div>
      </div>
    </section>
  )
}

export const dynamic = "force-dynamic"
