import { notFound } from "next/navigation"
import Image from "next/image"
import { getPayment, AsaasApiError } from "@/lib/asaas/client"
import { chargeStatus, isChargePayable } from "@/lib/asaas/charge-status"
import { prisma } from "@/lib/prisma"
import { CheckoutClient } from "./checkout-client"
import {
  isFirstMonthlyCharge,
  maxInstallmentsForCharge,
} from "@/lib/tenant-billing/installments"

interface Props {
  params: Promise<{ paymentId: string }>
}

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function formatDate(iso: string) {
  try {
    const [y, m, d] = iso.split("-")
    return `${d}/${m}/${y}`
  } catch {
    return iso
  }
}

const STATUS_INFO: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Pendente", color: "text-amber-600 bg-amber-50" },
  OVERDUE: { label: "Vencida", color: "text-rose-600 bg-rose-50" },
  RECEIVED: { label: "Paga", color: "text-emerald-600 bg-emerald-50" },
  CONFIRMED: { label: "Confirmada", color: "text-emerald-600 bg-emerald-50" },
  REFUNDED: { label: "Estornada", color: "text-gray-500 bg-gray-100" },
  DELETED: { label: "Cancelada", color: "text-gray-500 bg-gray-100" },
}

export default async function CobrancaPage({ params }: Props) {
  const { paymentId } = await params

  let payment: Awaited<ReturnType<typeof getPayment>>
  try {
    payment = await getPayment(paymentId)
  } catch (error) {
    if (error instanceof AsaasApiError && error.statusCode === 404) notFound()
    // Other errors still render, with a generic fallback
    throw error
  }

  // `status` do Asaas NUNCA vem como "DELETED" — não existe esse valor no enum
  // da API. A cobrança removida é soft delete: responde 200 e mantém PENDING.
  // Enquanto `isCancelled` dependia de `status === "DELETED"`, ele era código
  // morto: a cobrança apagada caía em `isPending` e a tela abria o checkout
  // inteiro, com um PIX que o banco do pagador recusa. `chargeStatus` colapsa
  // o removido em "DELETED" e `isChargePayable` exige as duas condições.
  const status = chargeStatus(payment)
  const isPaid = status === "RECEIVED" || status === "CONFIRMED"
  const isCancelled = status === "REFUNDED" || status === "DELETED"
  const isPending = isChargePayable(payment)

  // Parcelamento no cartão: vale para QUALQUER mensalidade em aberto, não só a
  // primeira. O teto sai de `maxInstallmentsForCharge` — a MESMA função que a
  // rota de pagamento aplica, senão a tela oferece um número que a API recusa.
  let maxInstallments = 1
  let isFirstCharge = false
  if (isPending && payment.subscription) {
    const [tenant, settings] = await Promise.all([
      prisma.tenant.findFirst({
        where: {
          OR: [
            { asaasSubscriptionId: payment.subscription },
            { asaasPromoSubscriptionId: payment.subscription },
          ],
        },
        select: {
          status: true,
          firstPaymentMaxInstallments: true,
          monthlyMaxInstallments: true,
        },
      }),
      prisma.systemSettings.findUnique({
        where: { id: "default" },
        select: { tenantMonthlyMaxInstallments: true },
      }),
    ])
    if (tenant) {
      isFirstCharge = isFirstMonthlyCharge(tenant.status)
      maxInstallments = maxInstallmentsForCharge({
        tenantStatus: tenant.status,
        firstPaymentMaxInstallments: tenant.firstPaymentMaxInstallments,
        monthlyMaxInstallments: tenant.monthlyMaxInstallments,
        globalMonthlyMaxInstallments:
          settings?.tenantMonthlyMaxInstallments ?? 12,
      })
    }
  }

  const statusInfo = STATUS_INFO[status] ?? {
    label: status,
    color: "text-gray-500 bg-gray-100",
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-xl items-center px-4 py-4">
          <Image
            src="/images/logo.png"
            alt="Profissionaliza Mais Brasil"
            width={140}
            height={36}
            className="h-9 w-auto object-contain"
          />
          <span className="ml-auto text-xs text-gray-400">
            Pagamento seguro
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8">
        {/* Payment summary card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Cobrança
              </p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {formatMoney(payment.value)}
              </p>
              {payment.description && (
                <p className="mt-1 text-sm text-gray-500">{payment.description}</p>
              )}
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            Vencimento: {formatDate(payment.dueDate)}
          </div>
        </div>

        {/* States */}
        {isPaid && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-base font-semibold text-emerald-800">
              Pagamento confirmado!
            </p>
            <p className="mt-1 text-sm text-emerald-700">
              Obrigado. Seu pagamento foi recebido com sucesso.
            </p>
          </div>
        )}

        {isCancelled && (
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
            <p className="text-base font-semibold text-gray-600">
              Cobrança cancelada
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Esta cobrança foi cancelada e não pode ser paga.
            </p>
          </div>
        )}

        {isPending && (
          <CheckoutClient
            paymentId={paymentId}
            billingType={payment.billingType}
            amount={payment.value}
            maxInstallments={maxInstallments}
            isFirstCharge={isFirstCharge}
          />
        )}
      </main>

      <footer className="mt-12 pb-8 text-center text-xs text-gray-400">
        Profissionaliza Mais Brasil · Pagamento 100% seguro
      </footer>
    </div>
  )
}
