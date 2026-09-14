import { headers } from "next/headers"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import {
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PRICE_SUFFIX,
} from "@/lib/subscriptions/interval"
import { SUBSCRIPTION_SLOTS_RULE_TEXT } from "@/lib/subscriptions/slots"
import { hasGatewayCharge } from "@/lib/subscriptions/store-payment"
import { SubscriptionPayForm } from "@/components/loja/subscription-pay-form"

export const dynamic = "force-dynamic"

interface Props {
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

function money(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Página de pagamento de uma ASSINATURA vendida pela venda direta do /painel.
 * Contraparte do `/pagar/<id>` da venda de curso: o aluno paga aqui, na loja
 * da unidade, e a cobrança nasce na conta dela (`store-payment.ts`) — sem ser
 * mandado para a página do Mercado Pago.
 */
export default async function PagarAssinaturaPage({ params }: Props) {
  const { id } = await params
  const h = await headers()
  const tenantId = h.get("x-tenant-id")
  const tenantSlug = h.get("x-tenant-slug")

  if (!tenantId && !tenantSlug) {
    return <Aviso titulo="Pagamento indisponível" texto="Não conseguimos identificar esta loja." />
  }

  const sub = await prisma.studentSubscription.findFirst({
    where: {
      id,
      ...(tenantId ? { tenantId } : { tenant: { slug: tenantSlug ?? undefined } }),
    },
    select: {
      status: true,
      priceAtPurchase: true,
      interval: true,
      mpPreapprovalId: true,
      asaasSubscriptionId: true,
      externalReference: true,
      plan: { select: { name: true, description: true } },
      student: { select: { nome: true } },
      tenant: {
        select: {
          status: true,
          salesGateway: true,
          asaasApiKey: true,
          asaasWebhookToken: true,
          mpAccessToken: true,
          mpPublicKey: true,
        },
      },
    },
  })

  if (!sub || !sub.tenant) {
    return <Aviso titulo="Cobrança não encontrada" texto="Este link de pagamento é inválido ou expirou." />
  }
  if (sub.tenant.status !== "ACTIVE") {
    return <Aviso titulo="Loja indisponível" texto="Esta loja não está aceitando pagamentos no momento." />
  }
  if (sub.status === "ACTIVE" || sub.status === "PAST_DUE") {
    return (
      <Aviso
        titulo="Pagamento já confirmado"
        texto="Esta assinatura já está ativa. Verifique seu e-mail para acessar os cursos."
      />
    )
  }
  if (sub.status !== "PENDING") {
    return <Aviso titulo="Cobrança indisponível" texto="Esta cobrança não está mais ativa." />
  }
  if (hasGatewayCharge(sub)) {
    return (
      <Aviso
        titulo="Pagamento em processamento"
        texto="O pagamento desta assinatura já foi iniciado. Se você ainda não concluiu, use a fatura que abriu ao pagar ou fale com a loja."
      />
    )
  }

  const gateway = tenantCheckoutMode({
    salesGateway: sub.tenant.salesGateway,
    asaasConnected: Boolean(sub.tenant.asaasApiKey && sub.tenant.asaasWebhookToken),
    mpAccessToken: sub.tenant.mpAccessToken,
    mpPublicKey: sub.tenant.mpPublicKey,
  })
  if (gateway === "NONE") {
    return <Aviso titulo="Loja indisponível" texto="Esta loja não está aceitando pagamentos no momento." />
  }

  const price = Number(sub.priceAtPurchase)

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            Finalizar assinatura
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Escolha a forma de pagamento. É seguro e processado aqui mesmo.
          </p>
        </header>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Assinatura
          </p>
          <h2 className="mt-1 text-lg font-bold text-[var(--color-pmb-green-900)]">
            {sub.plan.name}
          </h2>
          {sub.plan.description && (
            <p className="mt-2 text-sm text-gray-600">{sub.plan.description}</p>
          )}
          <p className="mt-4">
            <strong className="text-2xl text-[var(--color-pmb-green-900)]">
              {money(price)}
            </strong>
            <span className="text-sm text-gray-500">
              {" "}
              {INTERVAL_PRICE_SUFFIX[sub.interval]}
            </span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {INTERVAL_CHARGE_LABEL[sub.interval]}
          </p>
          <p className="mt-1 text-sm text-gray-500">{SUBSCRIPTION_SLOTS_RULE_TEXT}</p>
          {sub.student.nome && (
            <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
              Aluno: <strong className="text-gray-800">{sub.student.nome}</strong>
            </p>
          )}
        </div>

        <SubscriptionPayForm
          subscriptionId={id}
          planName={sub.plan.name}
          price={price}
          interval={sub.interval}
          gateway={gateway}
          mpPublicKey={sub.tenant.mpPublicKey}
          defaultHolderName={sub.student.nome ?? ""}
        />
      </div>
    </section>
  )
}
