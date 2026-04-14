"use client"

import { useState } from "react"
import { Tag, Calendar, Users } from "lucide-react"

interface Coupon {
  codigo: string
  descricao: string
  descontoLabel: string
  validoAte: string
  usos: string
  ativo: boolean
}

interface CouponCardProps {
  coupon: Coupon
  onToggleDetails?: () => void
}

export function CouponCard({ coupon, onToggleDetails }: CouponCardProps) {
  const [active, setActive] = useState(coupon.ativo)

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div
        className={`relative px-5 py-6 ${
          active
            ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white"
            : "bg-gray-100 text-gray-500"
        }`}
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">
          <Tag className="h-3 w-3" />
          Cupom
        </div>
        <div className="mt-2 font-mono text-2xl font-bold tracking-wide">
          {coupon.codigo}
        </div>
        <div className="mt-1 text-xs opacity-90">{coupon.descontoLabel}</div>
        <div className="absolute -left-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white" />
        <div className="absolute -right-3 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-white" />
      </div>

      <div className="p-5">
        <div className="text-sm font-medium text-[#1A1A2E]">
          {coupon.descricao}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {coupon.validoAte}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {coupon.usos}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={onToggleDetails}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Ver histórico
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <span className="text-xs font-medium text-gray-600">
              {active ? "Ativo" : "Pausado"}
            </span>
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                active ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  active ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>
        </div>
      </div>
    </div>
  )
}
