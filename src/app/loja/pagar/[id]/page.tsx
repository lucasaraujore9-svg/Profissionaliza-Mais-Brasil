import { headers } from "next/headers"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { MpCheckoutForm } from "@/components/loja/mp-checkout-form"
import { OrderSummary } from "@/components/loja/order-summary"
import {
  MAX_CARD_INSTALLMENTS,
  displayInterestFreeInstallments,
} from "@/lib/mercadopago/installments"

export const dynamic = "force-dynamic"

interface PagarPageProps {
  params: Promise<{ id: string }>
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {titulo}
      </h1>
      <p className="mt-3 text-sm text-gray-600">{texto}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-700)]"
      >
        Voltar para a loja
      </Link>
    </div>
  )
}

/**
 * Página de pagamento transparente de um link de venda manual (gerado pelo
 * revendedor em /painel/vendas). O aluno abre este link na vitrine e paga
 * cartão/PIX/boleto aqui mesmo — sem ser redirecionado para o Mercado Pago.
 */
export default async function PagarPage({ params }: PagarPageProps) {
  const { id } = await params
  const h = await headers()
  const tenantId = h.get("x-tenant-id")
  const tenantSlug = h.get("x-tenant-slug")

  if (!tenantId && !tenantSlug) {
    return <Aviso titulo="Pagamento indisponível" texto="Não conseguimos identificar esta loja." />
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id,
      ...(tenantId ? { tenantId } : { tenant: { slug: tenantSlug ?? undefined } }),
    },
    select: {
      id: true,
      status: true,
      paymentType: true,
      finalAmount: true,
      originalAmount: true,
      discountAmount: true,
      installmentsTotal: true,
      coursePackageId: true,
      coursePackage: { select: { name: true } },
      course: {
        select: {
          nome: true,
          cargaHoraria: true,
          categoriaLoja: true,
          categoriaInterna: true,
          capaOverride: true,
          capaImageUrl: true,
        },
      },
      student: { select: { email: true, nome: true } },
      tenant: {
        select: {
          status: true,
          mpPublicKey: true,
          interestFreeInstallments: true,
        },
      },
      tenantCourse: {
        select: {
          customParcelas: true,
          customCapaUrl: true,
          course: { select: { parcelasSugeridas: true, parcelasOverride: true } },
        },
      },
    },
  })

  if (!enrollment || !enrollment.tenant) {
    return <Aviso titulo="Cobrança não encontrada" texto="Este link de pagamento é inválido ou expirou." />
  }

  if (enrollment.status === "ACTIVE" || enrollment.status === "COMPLETED") {
    return (
      <Aviso
        titulo="Pagamento já confirmado"
        texto="Esta matrícula já está paga. Verifique seu e-mail para acessar o curso."
      />
    )
  }

  if (enrollment.status !== "PENDING") {
    return <Aviso titulo="Cobrança indisponível" texto="Esta cobrança não está mais ativa." />
  }

  if (enrollment.tenant.status !== "ACTIVE" || !enrollment.tenant.mpPublicKey) {
    return (
      <Aviso
        titulo="Loja indisponível"
        texto="Esta loja não está aceitando pagamentos no momento."
      />
    )
  }

  const payerEmail = enrollment.student.email
  if (!payerEmail) {
    return <Aviso titulo="Cadastro incompleto" texto="Falta o e-mail do aluno nesta cobrança. Contate a loja." />
  }

  // No cartão o aluno sempre pode dividir em até 12x (mensal = recorrência, 1x).
  // O nº de parcelas SEM juros vem de tenant.interestFreeInstallments.
  const isMonthly = enrollment.paymentType === "MONTHLY"
  const maxInstallments = isMonthly ? 1 : MAX_CARD_INSTALLMENTS

  // Venda de pacote: o resumo mostra o nome do pacote, não o do curso primário.
  const isPackage = !!enrollment.coursePackageId
  const summaryName = isPackage
    ? enrollment.coursePackage?.name ?? "Pacote de cursos"
    : enrollment.course.nome
  const summaryCategory = isPackage
    ? "Pacote"
    : enrollment.course.categoriaLoja ?? enrollment.course.categoriaInterna

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            Finalizar pagamento
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Escolha a forma de pagamento. É seguro e processado aqui mesmo.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
          <div>
            <MpCheckoutForm
              publicKey={enrollment.tenant.mpPublicKey}
              amount={Number(enrollment.finalAmount)}
              maxInstallments={maxInstallments}
              interestFreeInstallments={
                enrollment.tenant.interestFreeInstallments
              }
              enrollmentId={enrollment.id}
              defaultNome={enrollment.student.nome ?? undefined}
              defaultEmail={payerEmail}
            />
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary
              courseName={summaryName}
              courseCategory={summaryCategory}
              courseHours={isPackage ? null : enrollment.course.cargaHoraria}
              courseImageUrl={
                enrollment.tenantCourse?.customCapaUrl ??
                enrollment.course.capaOverride ??
                enrollment.course.capaImageUrl
              }
              basePrice={Number(enrollment.originalAmount)}
              discountAmount={Number(enrollment.discountAmount)}
              finalPrice={Number(enrollment.finalAmount)}
              couponCode={null}
              parcelasSugeridas={
                isMonthly
                  ? null
                  : displayInterestFreeInstallments(
                      enrollment.tenant.interestFreeInstallments,
                    )
              }
              paymentType={isMonthly ? "MONTHLY" : "ONE_TIME"}
              monthlyMonths={enrollment.installmentsTotal ?? maxInstallments}
            />
          </aside>
        </div>
      </div>
    </section>
  )
}
