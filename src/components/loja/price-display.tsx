"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Zap, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CouponField, type AppliedCoupon } from "./coupon-field"
import { StickyCTA } from "./sticky-cta"

interface PriceDisplayProps {
  courseId: string
  basePrice: number
  originalPrice: number | null
  parcelasSugeridas: number | null
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

export function PriceDisplay({
  courseId,
  basePrice,
  originalPrice,
  parcelasSugeridas,
}: PriceDisplayProps) {
  const [applied, setApplied] = useState<AppliedCoupon | null>(null)

  const finalPrice = applied ? applied.finalPrice : basePrice

  const discountLabel = useMemo(() => {
    if (originalPrice && originalPrice > basePrice) {
      const off = Math.round(((originalPrice - basePrice) / originalPrice) * 100)
      return `${off}% OFF`
    }
    return null
  }, [originalPrice, basePrice])

  const parcelasLabel = useMemo(() => {
    if (!parcelasSugeridas || parcelasSugeridas < 2) return null
    const valor = finalPrice / parcelasSugeridas
    return `${parcelasSugeridas}x de ${formatBRL(valor)}`
  }, [finalPrice, parcelasSugeridas])

  const checkoutHref = `/loja/checkout?course_id=${encodeURIComponent(courseId)}${
    applied ? `&coupon=${encodeURIComponent(applied.code)}` : ""
  }`

  return (
    <>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-green-600">
          <Zap className="h-3.5 w-3.5" />
          Oferta por tempo limitado
        </div>

        {(originalPrice || discountLabel) && (
          <div className="mt-3 flex items-baseline gap-3">
            {originalPrice && originalPrice > basePrice && (
              <span className="font-mono text-sm text-gray-400 line-through">
                {formatBRL(originalPrice)}
              </span>
            )}
            {discountLabel && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                {discountLabel}
              </span>
            )}
          </div>
        )}

        <div className="mt-2 font-mono text-4xl font-bold text-[#1A1A2E] lg:text-5xl">
          {formatBRL(finalPrice)}
        </div>
        {parcelasLabel && (
          <div className="mt-1 text-sm text-gray-600">
            ou{" "}
            <span className="font-mono font-semibold text-[#1A1A2E]">
              {parcelasLabel}
            </span>{" "}
            sem juros
          </div>
        )}

        <div className="mt-6">
          <CouponField
            courseId={courseId}
            applied={applied}
            onApply={setApplied}
            onRemove={() => setApplied(null)}
          />
        </div>

        <Link href={checkoutHref}>
          <Button
            size="lg"
            className="mt-6 w-full bg-blue-600 text-white hover:bg-blue-700"
          >
            Matricular-se Agora
          </Button>
        </Link>

        <div className="mt-4 flex items-start gap-2 text-xs text-gray-500">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          <span>
            Garantia de 7 dias. Se não gostar, devolvemos 100% do valor.
          </span>
        </div>
      </div>

      <StickyCTA
        href={checkoutHref}
        preco={formatBRL(finalPrice)}
        parcelas={parcelasLabel}
      />
    </>
  )
}
