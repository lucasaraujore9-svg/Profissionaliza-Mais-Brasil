import Link from "next/link"
import type { SubscriptionInterval } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { tenantCheckoutMode } from "@/lib/tenant/checkout-mode"
import {
  INTERVAL_CHARGE_LABEL,
  INTERVAL_PRICE_SUFFIX,
} from "@/lib/subscriptions/interval"
import { SUBSCRIPTION_SLOTS_RULE_TEXT } from "@/lib/subscriptions/slots"
import { hasGatewayCharge } from "@/lib/subscriptions/store-payment"
import { subscriptionCarneView } from "@/lib/subscriptions/carne-view"
import { hasCompleteBoletoAddress } from "@/lib/installments/mp-boleto"
import { SubscriptionPayForm } from "@/components/loja/subscription-pay-form"
import { InstallmentsSection } from "@/components/aluno/installments-section"

/**
 * Página de pagamento de uma ASSINATURA na plataforma — o único lugar onde o
 * aluno paga uma assinatura que já existe: venda direta (/painel e /admin),
 * 1º ciclo emitido e renovação. Servida em `/pagar/assinatura/<id>` na loja da
 * unidade (`tenantId` da loja) e no domínio da PMB (`tenantId` null).
 */

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

export async function SubscriptionPaymentPage({
  subscriptionId,
  tenantId,
  payEndpoint,
}: {
  subscriptionId: string
  /** Loja dona da assinatura; null = vitrine PMB. */
  tenantId: string | null
  payEndpoint: string
}) {
  const sub = await prisma.studentSubscription.findFirst({
    where: { id: subscriptionId, tenantId },
    select: {
      status: true,
      priceAtPurchase: true,
      interval: true,
      gateway: true,
      mpPreapprovalId: true,
      asaasSubscriptionId: true,
      externalReference: true,
      boletoCarne: true,
      plan: { select: { name: true, description: true } },
      student: {
        select: {
          nome: true,
          cep: true,
          rua: true,
          numero: true,
          bairro: true,
          cidade: true,
          estado: true,
        },
      },
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
      // Ciclo em aberto (1º PIX/boleto emitido ou renovação): é ele que se paga.
      payments: {
        where: { paidAt: null, status: { in: ["PENDING", "OVERDUE"] } },
        orderBy: { dueDate: "asc" },
        take: 1,
        select: { amount: true },
      },
    },
  })

  if (!sub || (tenantId && !sub.tenant)) {
    return <Aviso titulo="Cobrança não encontrada" texto="Este link de pagamento é inválido ou expirou." />
  }
  if (sub.tenant && sub.tenant.status !== "ACTIVE") {
    return <Aviso titulo="Loja indisponível" texto="Esta loja não está aceitando pagamentos no momento." />
  }
  if (sub.status === "CANCELLED" || sub.status === "EXPIRED") {
    return <Aviso titulo="Cobrança indisponível" texto="Esta cobrança não está mais ativa." />
  }

  if (sub.boletoCarne) {
    return <CarnePayment subscriptionId={subscriptionId} sub={sub} payEndpoint={payEndpoint} />
  }

  const openCycle = sub.payments[0] ?? null
  const charged = hasGatewayCharge(sub)
  const asaasCharge = charged && (sub.gateway === "ASAAS" || Boolean(sub.asaasSubscriptionId))

  if (charged && sub.mpPreapprovalId && !asaasCharge) {
    return (
      <Aviso
        titulo="Pagamento em processamento"
        texto="O pagamento desta assinatura já foi feito no cartão e está sendo confirmado. Verifique seu e-mail em instantes."
      />
    )
  }
  // Nada a pagar: ativa sem ciclo em aberto (a vitalícia do MP paga também cai aqui).
  const nothingOpen = asaasCharge ? sub.status !== "PENDING" && !openCycle : sub.status !== "PENDING"
  if (nothingOpen) {
    return (
      <Aviso
        titulo="Pagamento já confirmado"
        texto="Esta assinatura está em dia. Verifique seu e-mail para acessar os cursos."
      />
    )
  }

  // A cobrança do Asaas que já existe se paga no Asaas, mesmo que a loja tenha
  // trocado de gateway depois. Sem cobrança, vale o gateway ATIVO da loja; na
  // vitrine PMB, sempre o Asaas da conta-mãe.
  const gateway = asaasCharge
    ? "ASAAS"
    : sub.tenant
      ? tenantCheckoutMode({
          salesGateway: sub.tenant.salesGateway,
          asaasConnected: Boolean(sub.tenant.asaasApiKey && sub.tenant.asaasWebhookToken),
          mpAccessToken: sub.tenant.mpAccessToken,
          mpPublicKey: sub.tenant.mpPublicKey,
        })
      : "ASAAS"
  if (gateway === "NONE") {
    return <Aviso titulo="Loja indisponível" texto="Esta loja não está aceitando pagamentos no momento." />
  }

  const renewal = sub.status !== "PENDING"
  const price = openCycle ? Number(openCycle.amount) : Number(sub.priceAtPurchase)

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-3xl px-4 md:px-6">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            {renewal ? "Pagar assinatura" : "Finalizar assinatura"}
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
            {!renewal && (
              <span className="text-sm text-gray-500">
                {" "}
                {INTERVAL_PRICE_SUFFIX[sub.interval]}
              </span>
            )}
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
          subscriptionId={subscriptionId}
          planName={sub.plan.name}
          price={price}
          interval={sub.interval}
          gateway={gateway}
          mpPublicKey={sub.tenant?.mpPublicKey ?? null}
          endpoint={payEndpoint}
          renewal={renewal}
          defaultHolderName={sub.student.nome ?? ""}
          askBoletoAddress={!hasCompleteBoletoAddress(sub.student)}
        />
      </div>
    </section>
  )
}

function PlanCard({
  planName,
  description,
  studentName,
  children,
}: {
  planName: string
  description: string | null
  studentName: string | null
  children: React.ReactNode
}) {
  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Assinatura no boleto
      </p>
      <h2 className="mt-1 text-lg font-bold text-[var(--color-pmb-green-900)]">{planName}</h2>
      {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
      {children}
      <p className="mt-1 text-sm text-gray-500">{SUBSCRIPTION_SLOTS_RULE_TEXT}</p>
      {studentName && (
        <p className="mt-4 border-t border-gray-100 pt-4 text-sm text-gray-600">
          Aluno: <strong className="text-gray-800">{studentName}</strong>
        </p>
      )}
    </div>
  )
}

/**
 * Assinatura NO BOLETO: a lista de boletos (a mesma do carnê de curso) e, no
 * Asaas, o pagamento do boleto em aberto por PIX, cartão ou boleto. No Mercado
 * Pago o boleto é um pagamento próprio e se paga pelo próprio boleto da lista.
 */
async function CarnePayment({
  subscriptionId,
  sub,
  payEndpoint,
}: {
  subscriptionId: string
  sub: {
    status: string
    interval: SubscriptionInterval
    gateway: "MP" | "ASAAS"
    priceAtPurchase: unknown
    plan: { name: string; description: string | null }
    student: { nome: string | null }
    tenant: { mpPublicKey: string | null } | null
  }
  payEndpoint: string
}) {
  const rows = await prisma.subscriptionPayment.findMany({
    where: { subscriptionId, number: { not: null } },
    orderBy: { number: "asc" },
    select: {
      number: true,
      amount: true,
      dueDate: true,
      status: true,
      paidAt: true,
      bankSlipUrl: true,
      digitableLine: true,
      asaasPaymentId: true,
    },
  })
  const now = new Date()
  const carne = subscriptionCarneView({ id: subscriptionId, planName: sub.plan.name }, rows, now)
  // O boleto que se paga agora: o mais antigo em aberto que já foi emitido.
  const open = rows.find(
    (r) => !r.paidAt && r.status !== "CANCELLED" && (r.asaasPaymentId || r.bankSlipUrl),
  )
  const price = Number(open?.amount ?? sub.priceAtPurchase)

  return (
    <section className="bg-[#FAFAFA] py-10 md:py-16">
      <div className="mx-auto max-w-3xl space-y-6 px-4 md:px-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-pmb-green-900)] md:text-3xl">
            {open ? "Pagar boleto da assinatura" : "Assinatura no boleto"}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {open
              ? "Pague o boleto em aberto para manter o acesso aos cursos."
              : "Nenhum boleto em aberto agora. O próximo fica disponível 7 dias antes do vencimento."}
          </p>
        </header>

        <PlanCard
          planName={sub.plan.name}
          description={sub.plan.description}
          studentName={sub.student.nome}
        >
          <p className="mt-4">
            <strong className="text-2xl text-[var(--color-pmb-green-900)]">
              {money(Number(sub.priceAtPurchase))}
            </strong>
            <span className="text-sm text-gray-500"> {INTERVAL_PRICE_SUFFIX[sub.interval]}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Um boleto por ciclo, renovado automaticamente até o cancelamento.
          </p>
        </PlanCard>

        {carne && (
          <InstallmentsSection
            carnes={[carne]}
            title="Boletos da assinatura"
            description="Cada boleto fica disponível 7 dias antes do vencimento. Pague para manter o acesso aos cursos."
          />
        )}

        {open && sub.gateway === "ASAAS" && (
          <SubscriptionPayForm
            subscriptionId={subscriptionId}
            planName={sub.plan.name}
            price={price}
            interval={sub.interval}
            gateway="ASAAS"
            mpPublicKey={sub.tenant?.mpPublicKey ?? null}
            endpoint={payEndpoint}
            renewal
            carneOpen
            defaultHolderName={sub.student.nome ?? ""}
          />
        )}
      </div>
    </section>
  )
}
