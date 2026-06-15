import Image from "next/image"
import { Tag, GraduationCap } from "lucide-react"
import { shouldUnoptimizeImage } from "@/lib/images"

export interface OrderSummaryProps {
  courseName: string
  courseCategory: string | null
  courseHours: string | null
  /** Capa do curso já resolvida (override da vitrine → capa do curso). */
  courseImageUrl?: string | null
  basePrice: number
  discountAmount: number
  finalPrice: number
  couponCode: string | null
  parcelasSugeridas: number | null
  /** ONE_TIME = preço cheio; MONTHLY = mensalidade recorrente. */
  paymentType?: "ONE_TIME" | "MONTHLY"
  /** Quantidade total de mensalidades quando paymentType === "MONTHLY". */
  monthlyMonths?: number | null
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

export function OrderSummary({
  courseName,
  courseCategory,
  courseHours,
  courseImageUrl,
  basePrice,
  discountAmount,
  finalPrice,
  couponCode,
  parcelasSugeridas,
  paymentType = "ONE_TIME",
  monthlyMonths,
}: OrderSummaryProps) {
  const isMonthly = paymentType === "MONTHLY"
  const months = isMonthly ? monthlyMonths ?? 12 : null

  const parcelasLabel =
    !isMonthly && parcelasSugeridas && parcelasSugeridas >= 2
      ? `${parcelasSugeridas}x de ${formatBRL(finalPrice / parcelasSugeridas)}`
      : null

  const totalLabel = isMonthly ? "Mensalidade" : "Total"

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Resumo do pedido</h2>

      <div className="mt-5 flex gap-4 border-b border-gray-100 pb-5">
        {courseImageUrl ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-[rgba(2,89,24,0.08)]">
            <Image
              src={courseImageUrl}
              alt={courseName}
              fill
              sizes="80px"
              className="object-cover"
              unoptimized={shouldUnoptimizeImage(courseImageUrl)}
            />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-pmb-lime-50)] to-[var(--color-pmb-mist)] text-[var(--color-pmb-green)] ring-1 ring-[rgba(2,89,24,0.08)]">
            <GraduationCap className="h-8 w-8" aria-hidden />
          </div>
        )}
        <div className="flex-1">
          <div className="text-xs font-medium text-gray-500">
            {courseCategory ?? "Curso"}
          </div>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug text-[var(--color-pmb-green-900)]">
            {courseName}
          </h3>
          {courseHours && (
            <div className="mt-1 text-xs text-gray-500">{courseHours}</div>
          )}
        </div>
      </div>

      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-gray-600">
            {isMonthly ? "Valor da mensalidade" : "Subtotal"}
          </dt>
          <dd className="font-mono text-[var(--color-pmb-green-900)]">{formatBRL(basePrice)}</dd>
        </div>
        {discountAmount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-gray-600">
              Desconto{couponCode ? ` (${couponCode})` : ""}
            </dt>
            <dd className="font-mono font-semibold text-green-600">
              -{formatBRL(discountAmount)}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-5">
        <span className="text-sm font-medium text-[var(--color-pmb-green-900)]">{totalLabel}</span>
        <span className="font-mono text-2xl font-bold text-[var(--color-pmb-green-900)]">
          {formatBRL(finalPrice)}
          {isMonthly && (
            <span className="ml-1 text-sm font-medium text-gray-500">/mês</span>
          )}
        </span>
      </div>

      {isMonthly && months && (
        <div className="mt-2 text-right text-xs text-gray-500">
          <span className="font-mono font-medium">{months}</span> mensalidades de{" "}
          <span className="font-mono font-medium">{formatBRL(finalPrice)}</span>
        </div>
      )}

      {parcelasLabel && (
        <div className="mt-2 text-right text-xs text-gray-500">
          ou <span className="font-mono font-medium">{parcelasLabel}</span> sem juros
        </div>
      )}

      {couponCode && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-[var(--color-pmb-lime-50)] p-3 text-xs text-[var(--color-pmb-green-700)]">
          <Tag className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Cupom <strong className="font-mono">{couponCode}</strong> aplicado
          </span>
        </div>
      )}
    </div>
  )
}
