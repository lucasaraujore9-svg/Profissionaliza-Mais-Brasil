import { headers } from "next/headers"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { MpCheckoutForm } from "@/components/loja/mp-checkout-form"
import { AsaasCheckoutForm } from "@/components/loja/asaas-checkout-form"
import { OrderSummary } from "@/components/loja/order-summary"
import {
  InstallmentsSection,
  type InstallmentCarne,
} from "@/components/aluno/installments-section"
import {
  isWithinRevealWindow,
  INSTALLMENT_REVEAL_WINDOW_DAYS,
} from "@/lib/installments/schedule"
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
      // Gateway da matrícula (herdado do salesGateway da unidade na venda). É
      // ele — e não as credenciais MP — que decide qual formulário renderizar,
      // igual a /aluno/comprar/pagar/[id].
      gateway: true,
      paymentType: true,
      finalAmount: true,
      originalAmount: true,
      discountAmount: true,
      installmentsTotal: true,
      coursePackageId: true,
      coursePackage: { select: { name: true, coverImageUrl: true } },
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
      student: { select: { email: true, nome: true, cpf: true } },
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
      boletoInstallments: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { number: "asc" },
      },
    },
  })

  if (!enrollment || !enrollment.tenant) {
    return <Aviso titulo="Cobrança não encontrada" texto="Este link de pagamento é inválido ou expirou." />
  }

  if (enrollment.tenant.status !== "ACTIVE") {
    return (
      <Aviso
        titulo="Loja indisponível"
        texto="Esta loja não está aceitando pagamentos no momento."
      />
    )
  }

  // Venda de pacote: o nome comercial do pacote é o item comprado. O `course`
  // da matrícula é apenas o primeiro curso técnico usado pelo fulfillment.
  const isPackage = !!enrollment.coursePackageId
  const summaryName = isPackage
    ? enrollment.coursePackage?.name ?? "Pacote de cursos"
    : enrollment.course.nome
  const summaryCategory = isPackage
    ? "Pacote"
    : enrollment.course.categoriaLoja ?? enrollment.course.categoriaInterna
  const summaryImage =
    enrollment.coursePackage?.coverImageUrl ??
    enrollment.tenantCourse?.customCapaUrl ??
    enrollment.course.capaOverride ??
    enrollment.course.capaImageUrl

  // O carnê já foi criado na venda direta. Não oferecemos um novo checkout
  // sobre `finalAmount` (o total da compra): mostramos as N parcelas reais,
  // com seus boletos, vencimentos e valor unitário.
  if (
    enrollment.boletoInstallments.length > 0 &&
    enrollment.status !== "CANCELLED"
  ) {
    const now = new Date()
    const carne: InstallmentCarne = {
      enrollmentId: enrollment.id,
      courseName: summaryName,
      parcelas: enrollment.boletoInstallments.map((row) => {
        const inWindow = isWithinRevealWindow(
          { number: row.number, dueDate: row.dueDate },
          now,
        )
        let availableFromISO: string | null = null
        if (!inWindow) {
          const from = new Date(row.dueDate)
          from.setUTCDate(from.getUTCDate() - INSTALLMENT_REVEAL_WINDOW_DAYS)
          availableFromISO = from.toISOString()
        }
        return {
          number: row.number,
          amount: Number(row.amount),
          dueDateISO: row.dueDate.toISOString(),
          status: row.status,
          available:
            row.status !== "PAID" && row.status !== "CANCELLED" && inWindow,
          availableFromISO,
          invoiceUrl: row.invoiceUrl,
          digitableLine: row.digitableLine,
        }
      }),
    }
    const installmentCount =
      enrollment.installmentsTotal ?? enrollment.boletoInstallments.length
    const installmentAmount =
      Number(enrollment.boletoInstallments[0]?.amount) ||
      Number(enrollment.finalAmount) / installmentCount

    return (
      <section className="bg-[#FAFAFA] py-10 md:py-16">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
              Pagamento parcelado
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Sua compra foi dividida em {installmentCount} parcelas de{" "}
              {installmentAmount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
              .
            </p>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
            <InstallmentsSection carnes={[carne]} />
            <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
              <OrderSummary
                courseName={summaryName}
                courseCategory={summaryCategory}
                courseHours={isPackage ? null : enrollment.course.cargaHoraria}
                courseImageUrl={summaryImage}
                basePrice={Number(enrollment.originalAmount)}
                discountAmount={Number(enrollment.discountAmount)}
                finalPrice={Number(enrollment.finalAmount)}
                couponCode={null}
                parcelasSugeridas={null}
                paymentType="ONE_TIME"
                installmentPlan={{
                  count: installmentCount,
                  amount: installmentAmount,
                }}
              />
            </aside>
          </div>
        </div>
      </section>
    )
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

  const isAsaas = enrollment.gateway === "ASAAS"
  // A public key só existe (e só é necessária) no Payment Brick do MP. Exigi-la
  // sempre barrava a cobrança de uma unidade que vende pelo Asaas.
  if (!isAsaas && !enrollment.tenant.mpPublicKey) {
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
  // O Asaas cria o cliente da cobrança a partir do CPF do aluno da matrícula (o
  // CPF digitado aqui não é usado): sem ele a cobrança falharia no gateway.
  if (isAsaas && !enrollment.student.cpf) {
    return <Aviso titulo="Cadastro incompleto" texto="Falta o CPF do aluno nesta cobrança. Contate a loja." />
  }

  // No cartão o aluno sempre pode dividir em até 12x (mensal = recorrência, 1x).
  // O nº de parcelas SEM juros vem de tenant.interestFreeInstallments.
  const isMonthly = enrollment.paymentType === "MONTHLY"
  const maxInstallments = isMonthly ? 1 : MAX_CARD_INSTALLMENTS

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
            {isAsaas ? (
              // payMode: a matrícula já existe, então o form pula o init e cobra
              // direto no /process, que roteia pelo enrollment.gateway. Os paths
              // default já são os da vitrine (/api/loja/checkout/*).
              <AsaasCheckoutForm
                enrollmentId={enrollment.id}
                amount={Number(enrollment.finalAmount)}
                defaultNome={enrollment.student.nome ?? undefined}
                defaultEmail={payerEmail}
              />
            ) : (
              <MpCheckoutForm
                publicKey={enrollment.tenant.mpPublicKey!}
                amount={Number(enrollment.finalAmount)}
                maxInstallments={maxInstallments}
                interestFreeInstallments={
                  enrollment.tenant.interestFreeInstallments
                }
                enrollmentId={enrollment.id}
                defaultNome={enrollment.student.nome ?? undefined}
                defaultEmail={payerEmail}
              />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary
              courseName={summaryName}
              courseCategory={summaryCategory}
              courseHours={isPackage ? null : enrollment.course.cargaHoraria}
              courseImageUrl={summaryImage}
              basePrice={Number(enrollment.originalAmount)}
              discountAmount={Number(enrollment.discountAmount)}
              finalPrice={Number(enrollment.finalAmount)}
              couponCode={null}
              parcelasSugeridas={
                // "Nx sem juros" é do cartão do MP; a cobrança avulsa no Asaas
                // não parcela, então não anuncia parcelamento que não existe.
                isMonthly || isAsaas
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
