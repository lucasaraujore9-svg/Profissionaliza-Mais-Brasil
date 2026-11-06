import Link from "next/link"
import { CalendarClock, CheckCircle2, CreditCard } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { PAYER_SELECT, resolvePayer } from "@/lib/checkout/payer"
import { pmbMpPublicKey } from "@/lib/pmb-config"
import {
  flexOffer,
  flexRowsSummary,
  flexRowLabel,
  type FlexOffer,
} from "@/lib/installments/flex"
import {
  INSTALLMENT_REVEAL_WINDOW_DAYS,
  isWithinRevealWindow,
} from "@/lib/installments/schedule"
import { AsaasCheckoutForm } from "@/components/loja/asaas-checkout-form"
import { MpCheckoutForm } from "@/components/loja/mp-checkout-form"
import { OrderSummary } from "@/components/loja/order-summary"
import {
  InstallmentsSection,
  type InstallmentCarne,
} from "@/components/aluno/installments-section"

/**
 * Página de pagamento da venda direta PARCELADA (`flexInstallments`), servida
 * em `/pagar/<id>` na loja da unidade e no domínio da PMB. Mostra a linha da
 * vez, o que o aluno pode fazer com ela (`flexOffer`) e o plano inteiro.
 * O formulário cobra pelas rotas `/parcela` — nunca a página do gateway.
 */

const CARD_SUBSCRIPTION_NOTE =
  "As próximas parcelas serão cobradas automaticamente neste cartão."

// Matrícula em que a linha da vez ainda pode ser paga (igual a flex-pay.ts).
const PAYABLE_STATUSES = new Set(["PENDING", "ACTIVE", "SUSPENDED"])

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">
        {titulo}
      </h1>
      <p className="mt-3 text-sm text-gray-600">{texto}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-[var(--brand-btn)] px-4 py-2 text-sm font-medium text-[var(--brand-btn-on)] hover:bg-[var(--brand-btn-hover)]"
      >
        Voltar para a loja
      </Link>
    </div>
  )
}

function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Vencimentos e janelas são calculados em UTC (schedule.ts).
function dayMonth(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })
}

function OfferNotice({ offer }: { offer: Exclude<FlexOffer, { kind: "pay" }> }) {
  const { Icon, text } =
    offer.kind === "auto"
      ? {
          Icon: CreditCard,
          text: `Cobrança automática no cartão. Próxima em ${dayMonth(offer.nextDueDate)}.`,
        }
      : offer.kind === "waiting"
        ? {
            Icon: CalendarClock,
            text: `A próxima parcela fica disponível em ${dayMonth(offer.availableFrom)}.`,
          }
        : { Icon: CheckCircle2, text: "Plano quitado." }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <Icon className="h-5 w-5 shrink-0 text-[var(--color-pmb-green)]" aria-hidden />
      <p className="text-sm font-medium text-[var(--color-pmb-green-900)]">{text}</p>
    </div>
  )
}

export async function FlexInstallmentPage({
  enrollmentId,
  scope,
  store,
}: {
  enrollmentId: string
  /** Loja dona da matrícula; null = vitrine PMB. */
  scope: { tenantId: string | null }
  store: "loja" | "pmb"
}) {
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: enrollmentId, tenantId: scope.tenantId, flexInstallments: true },
    select: {
      id: true,
      status: true,
      flexHasDownPayment: true,
      installmentMethod: true,
      asaasSubscriptionId: true,
      mpSubscriptionId: true,
      finalAmount: true,
      originalAmount: true,
      discountAmount: true,
      coursePackageId: true,
      coursePackage: { select: { name: true, coverImageUrl: true } },
      bundleCourseIds: true,
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
      tenantCourse: { select: { customCapaUrl: true } },
      tenant: { select: { mpPublicKey: true } },
      student: { select: PAYER_SELECT },
      boletoInstallments: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          amount: true,
          dueDate: true,
          status: true,
          gateway: true,
          cardDeclinedAt: true,
          // Na linha do parcelado guarda só o PDF do boleto (flex-charge.ts).
          invoiceUrl: true,
          digitableLine: true,
        },
      },
    },
  })

  if (!enrollment) {
    return <Aviso titulo="Cobrança não encontrada" texto="Este link de pagamento é inválido ou expirou." />
  }

  const rows = enrollment.boletoInstallments
  const hasDownPayment = enrollment.flexHasDownPayment
  const now = new Date()
  const offer = flexOffer(
    {
      hasDownPayment,
      method: enrollment.installmentMethod,
      subscriptionActive: !!(enrollment.asaasSubscriptionId || enrollment.mpSubscriptionId),
      rows,
    },
    now,
  )

  // CANCELLED nunca; COMPLETED só para mostrar o plano já quitado (a rota de
  // pagamento recusa os dois).
  if (
    enrollment.status === "CANCELLED" ||
    (!PAYABLE_STATUSES.has(enrollment.status) && offer.kind !== "done")
  ) {
    return <Aviso titulo="Cobrança indisponível" texto="Esta cobrança não está mais ativa." />
  }

  const currentRow = rows.find((r) => r.status !== "PAID")
  const payRow = offer.kind === "pay" ? rows.find((r) => r.number === offer.rowNumber) : undefined
  const payer = resolvePayer(enrollment.student)
  const isAsaas = (payRow?.gateway ?? "ASAAS") === "ASAAS"
  const mpPublicKey =
    store === "pmb" ? pmbMpPublicKey() : enrollment.tenant?.mpPublicKey ?? null

  if (payRow) {
    if (!isAsaas && !mpPublicKey) {
      return <Aviso titulo="Pagamento indisponível" texto="O pagamento desta cobrança não está disponível no momento. Contate a loja." />
    }
    if (!payer.email) {
      return <Aviso titulo="Cadastro incompleto" texto="Falta o e-mail do pagador nesta cobrança. Contate a loja." />
    }
    // O Asaas cria o cliente da cobrança a partir do CPF do cadastro (o CPF
    // digitado no formulário não é usado): sem ele a cobrança falharia.
    if (isAsaas && !payer.cpf) {
      return <Aviso titulo="Cadastro incompleto" texto="Falta o CPF do pagador nesta cobrança. Contate a loja." />
    }
  }

  // Resumo do pedido: mesmo item comercial das outras /pagar (pacote / vários cursos).
  const isPackage = !!enrollment.coursePackageId
  const bundleCourses = enrollment.bundleCourseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: enrollment.bundleCourseIds } },
        select: { nome: true },
      })
    : []
  const isBundle = bundleCourses.length > 0
  const summaryName = isPackage
    ? enrollment.coursePackage?.name ?? "Pacote de cursos"
    : isBundle
      ? [enrollment.course.nome, ...bundleCourses.map((c) => c.nome)].join(" + ")
      : enrollment.course.nome
  const summaryCategory = isPackage
    ? "Pacote"
    : isBundle
      ? `${bundleCourses.length + 1} cursos`
      : enrollment.course.categoriaLoja ?? enrollment.course.categoriaInterna
  const summaryImage =
    enrollment.coursePackage?.coverImageUrl ??
    enrollment.tenantCourse?.customCapaUrl ??
    enrollment.course.capaOverride ??
    enrollment.course.capaImageUrl

  // Renegociação (edit.ts) pode deixar parcelas com valores diferentes.
  const planSummary = flexRowsSummary(
    rows.map((r) => ({ amount: Number(r.amount) })),
    hasDownPayment,
  )
  const label = (row: { number: number }) => flexRowLabel(row, hasDownPayment, rows.length)
  const headerRow = payRow ?? currentRow

  const carne: InstallmentCarne = {
    id: enrollment.id,
    courseName: summaryName,
    parcelas: rows.map((row) => {
      const paid = row.status === "PAID"
      let availableFromISO: string | null = null
      if (!paid && !isWithinRevealWindow(row, now)) {
        const from = new Date(row.dueDate)
        from.setUTCDate(from.getUTCDate() - INSTALLMENT_REVEAL_WINDOW_DAYS)
        availableFromISO = from.toISOString()
      }
      return {
        number: row.number,
        label: label(row),
        amount: Number(row.amount),
        dueDateISO: row.dueDate.toISOString(),
        status: row.status,
        // Só a linha com boleto emitido tem o que abrir; PIX e cartão se pagam no formulário.
        available: !paid && !!row.invoiceUrl,
        availableFromISO,
        invoiceUrl: row.invoiceUrl,
        digitableLine: row.digitableLine,
        cardDeclinedAt: row.cardDeclinedAt?.toISOString() ?? null,
      }
    }),
  }

  const formCommon = payRow
    ? {
        enrollmentId: enrollment.id,
        boletoInstallmentId: payRow.id,
        amount: Number(payRow.amount),
        methods: offer.kind === "pay" ? offer.methods : undefined,
        cardNote:
          offer.kind === "pay" && offer.card === "subscription"
            ? CARD_SUBSCRIPTION_NOTE
            : undefined,
        // A linha não se parcela de novo no cartão.
        interestFreeInstallments: 1,
        defaultNome: payer.nome || undefined,
        defaultEmail: payer.email ?? undefined,
        // Pago, volta para esta página com o plano atualizado. A confirmação
        // padrão diria "Matrícula realizada" com o total do plano e dispararia
        // de novo o Purchase do pixel. O form anexa `?enrollment_id=`.
        confirmacaoPath: `/pagar/${enrollment.id}`,
        ...(store === "pmb"
          ? {
              processPath: "/api/checkout/parcela",
              statusPath: "/api/checkout/parcela/status",
            }
          : {
              processPath: "/api/loja/checkout/parcela",
              statusPath: "/api/loja/checkout/parcela/status",
            }),
      }
    : null

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            {headerRow
              ? `${label(headerRow)} · ${brl(Number(headerRow.amount))}`
              : "Plano quitado"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{planSummary}</p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px] lg:gap-8">
          <div className="space-y-6">
            {formCommon && payRow ? (
              isAsaas ? (
                <AsaasCheckoutForm
                  {...formCommon}
                  submitLabel={`Pagar ${label(payRow).toLowerCase()}`}
                />
              ) : (
                <MpCheckoutForm
                  {...formCommon}
                  publicKey={mpPublicKey!}
                  maxInstallments={1}
                  {...(store === "pmb"
                    ? { installmentsPath: "/api/checkout/installments" }
                    : {})}
                />
              )
            ) : offer.kind !== "pay" ? (
              <OfferNotice offer={offer} />
            ) : null}

            <InstallmentsSection
              carnes={[carne]}
              title="Parcelas do plano"
              description="Cada parcela fica disponível a partir de 7 dias antes do vencimento."
            />
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
              parcelasSugeridas={null}
              paymentType="ONE_TIME"
            />
          </aside>
        </div>
      </div>
    </section>
  )
}
