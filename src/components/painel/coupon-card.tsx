"use client"

import { Tag, Calendar, Users } from "lucide-react"

export interface CouponListItem {
  id: string
  code: string
  discountType: "PERCENTAGE" | "FIXED"
  discountValue: number
  maxUses: number | null
  usedCount: number
  validFrom: string
  validUntil: string
  isActive: boolean
}

interface CouponCardProps {
  coupon: CouponListItem
  pending?: boolean
  onToggle: (coupon: CouponListItem) => void
  onViewUsage: (coupon: CouponListItem) => void
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

function formatDiscount(coupon: CouponListItem): string {
  if (coupon.discountType === "PERCENTAGE") {
    return `${coupon.discountValue}% de desconto`
  }
  return `${formatCurrency(coupon.discountValue)} de desconto`
}

function formatValidity(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR")
  } catch {
    return "—"
  }
}

function formatUsage(coupon: CouponListItem): string {
  if (coupon.maxUses === null || coupon.maxUses === undefined) {
    return `${coupon.usedCount} usos`
  }
  return `${coupon.usedCount} de ${coupon.maxUses}`
}

export function CouponCard({
  coupon,
  pending,
  onToggle,
  onViewUsage,
}: CouponCardProps) {
  const { isActive } = coupon

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        className={`relative px-5 py-6 ${
          isActive
            ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
            : "bg-gray-100 text-gray-500"
        }`}
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">
          <Tag className="h-3 w-3" />
          Cupom
        </div>
        <div className="mt-2 font-mono text-2xl font-bold tracking-wide">
          {coupon.code}
        </div>
        <div className="mt-1 text-xs opacity-90">{formatDiscount(coupon)}</div>
        <div className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white" />
        <div className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white" />
      </div>

      <div className="p-5">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            até {formatValidity(coupon.validUntil)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {formatUsage(coupon)}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => onViewUsage(coupon)}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Ver histórico
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="text-xs font-medium text-gray-600">
              {isActive ? "Ativo" : "Pausado"}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => onToggle(coupon)}
              className={`relative h-5 w-9 rounded-full transition-colors disabled:opacity-50 ${
                isActive ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  isActive ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      </div>
    </div>
  )
}
