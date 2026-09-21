import Image from "next/image"
import { Sparkles } from "lucide-react"
import type { SubscriptionIntervalValue } from "@/lib/subscriptions/interval"
import {
  INTERVAL_CHARGE_LABEL,
  INTERVAL_LABEL,
  INTERVAL_PRICE_SUFFIX,
  isRecurringInterval,
} from "@/lib/subscriptions/interval"
import { SUBSCRIPTION_SLOTS_RULE_TEXT } from "@/lib/subscriptions/slots"

/**
 * Resumo do pedido de uma ASSINATURA no checkout — irmao visual do
 * `OrderSummary` de curso/pacote, para o aluno reconhecer a mesma tela.
 *
 * Componente separado, e nao um modo do `OrderSummary`, porque os numeros dizem
 * coisas diferentes: la o total e o que se paga UMA vez (ou a mensalidade de um
 * carne com N parcelas conhecidas); aqui e o valor de CADA ciclo, sem fim
 * previsto. O "N mensalidades de R$ X" daquele componente (que assume 12 quando
 * nao sabe) anunciaria um numero de cobrancas que a assinatura nao tem.
 *
 * Sem cupom e sem parcelamento de proposito: nenhum checkout de assinatura
 * escreve `StudentSubscription.couponId`, e a recorrencia cobra um valor por
 * ciclo — mostrar "12x sem juros" aqui prometeria o que a cobranca nao faz.
 */

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

interface Props {
  planName: string
  price: number
  interval: SubscriptionIntervalValue
  courseCount: number | null
  coverImageUrl?: string | null
}

export function SubscriptionOrderSummary({
  planName,
  price,
  interval,
  courseCount,
  coverImageUrl,
}: Props) {
  const recurring = isRecurringInterval(interval)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h2 className="text-base font-semibold text-[var(--brand-primary,var(--color-pmb-green-900))]">
        Resumo do pedido
      </h2>

      <div className="mt-5 flex gap-4 border-b border-gray-100 pb-5">
        {coverImageUrl ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-[rgba(2,89,24,0.08)]">
            <Image
              src={coverImageUrl}
              alt={planName}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-pmb-lime-50)] to-[var(--color-pmb-mist)] text-[var(--color-pmb-green)] ring-1 ring-[rgba(2,89,24,0.08)]">
            <Sparkles className="h-8 w-8" aria-hidden />
          </div>
        )}
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-500">
            Assinatura {INTERVAL_LABEL[interval].toLowerCase()}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-[var(--brand-primary,var(--color-pmb-green-900))]">
            {planName}
          </h3>
          {courseCount !== null && (
            <div className="mt-1 text-xs text-gray-500">
              Acesso a {courseCount} {courseCount === 1 ? "curso" : "cursos"}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5">
        <span className="text-sm font-medium text-[var(--brand-primary,var(--color-pmb-green-900))]">
          {recurring ? "Valor por ciclo" : "Total"}
        </span>
        <span className="font-mono text-2xl font-bold text-[var(--brand-primary,var(--color-pmb-green-900))]">
          {formatBRL(price)}
          <span className="ml-1 font-sans text-sm font-medium text-gray-500">
            {INTERVAL_PRICE_SUFFIX[interval]}
          </span>
        </span>
      </div>

      <p className="mt-2 text-right text-xs text-gray-500">
        {INTERVAL_CHARGE_LABEL[interval]}
        {recurring ? " · sem fidelidade" : ""}
      </p>

      <p className="mt-5 rounded-xl bg-[var(--color-pmb-lime-50)] p-3 text-xs leading-relaxed text-[var(--color-pmb-green-700)]">
        {SUBSCRIPTION_SLOTS_RULE_TEXT}
      </p>
    </div>
  )
}
