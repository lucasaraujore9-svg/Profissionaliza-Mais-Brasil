import Link from "next/link"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { isPmbAppHost } from "@/lib/tenant/urls"
import { OrderSummary } from "@/components/loja/order-summary"
import { PmbCheckoutForm } from "@/components/loja/pmb-checkout-form"

export const dynamic = "force-dynamic"

interface PagarPmbPageProps {
  params: Promise<{ id: string }>
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold text-[var(--color-pmb-green-900)]">{titulo}</h1>
      <p className="mt-3 text-sm text-gray-600">{texto}</p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-pmb-green-700)]"
      >
        Voltar para o início
      </Link>
    </div>
  )
}

/**
 * Tela de checkout do SISTEMA-MÃE (PMB) que retoma uma cobrança PENDENTE de uma
 * venda direta (sem criar matrícula nova). Servida no domínio app
 * (profissionalizamaisbrasil.com.br/pagar/[id]) — o proxy não reescreve /pagar
 * no host app (só em subdomínio de vitrine). Cobra na conta Asaas da PMB via
 * POST /api/checkout/enrollment/[id], reusando o PmbCheckoutForm transparente.
 */
export default async function PagarPmbPage({ params }: PagarPmbPageProps) {
  const { id } = await params

  // Defesa em profundidade: este checkout cobra na conta da PMB. Não renderiza
  // sob domínio de revenda (o /api/checkout/enrollment também recusa por host).
  const host = (await headers()).get("host")
  if (!isPmbAppHost(host)) {
    return <Aviso titulo="Pagamento indisponível" texto="Não foi possível identificar esta loja." />
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { id, tenantId: null, gateway: "ASAAS" },
    select: {
      id: true,
      status: true,
      paymentType: true,
      installmentsTotal: true,
      finalAmount: true,
      originalAmount: true,
      discountAmount: true,
      course: {
        select: {
          nome: true,
          cargaHoraria: true,
          categoriaLoja: true,
          categoriaInterna: true,
          parcelasSugeridas: true,
          capaOverride: true,
          capaImageUrl: true,
        },
      },
      student: { select: { nome: true, email: true, cpf: true, fone: true } },
    },
  })

  if (!enrollment) {
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

  const s = enrollment.student
  if (!s.email || !s.cpf || !s.fone) {
    return (
      <Aviso
        titulo="Cadastro incompleto"
        texto="Faltam dados do aluno (e-mail, CPF ou telefone) nesta cobrança. Contate o suporte."
      />
    )
  }

  const isMonthly = enrollment.paymentType === "MONTHLY"

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
          <PmbCheckoutForm
            couponCode={null}
            initPath={`/api/checkout/enrollment/${enrollment.id}`}
            prefill={{
              nome: s.nome,
              email: s.email,
              cpf: s.cpf,
              telefone: s.fone,
            }}
          />

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <OrderSummary
              courseName={enrollment.course.nome}
              courseCategory={
                enrollment.course.categoriaLoja ?? enrollment.course.categoriaInterna
              }
              courseHours={enrollment.course.cargaHoraria}
              courseImageUrl={
                enrollment.course.capaOverride ?? enrollment.course.capaImageUrl
              }
              basePrice={Number(enrollment.originalAmount)}
              discountAmount={Number(enrollment.discountAmount)}
              finalPrice={Number(enrollment.finalAmount)}
              couponCode={null}
              parcelasSugeridas={enrollment.course.parcelasSugeridas}
              paymentType={isMonthly ? "MONTHLY" : "ONE_TIME"}
              monthlyMonths={enrollment.installmentsTotal ?? undefined}
            />
          </aside>
        </div>
      </div>
    </section>
  )
}
