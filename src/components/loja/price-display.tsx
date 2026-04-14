import Link from "next/link"
import { Zap, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CouponField } from "./coupon-field"

interface PriceDisplayProps {
  precoOriginal: string
  preco: string
  parcelas: string
}

export function PriceDisplay({ precoOriginal, preco, parcelas }: PriceDisplayProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-green-600">
        <Zap className="h-3.5 w-3.5" />
        Oferta por tempo limitado
      </div>

      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-mono text-sm text-gray-400 line-through">
          {precoOriginal}
        </span>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
          34% OFF
        </span>
      </div>

      <div className="mt-2 font-mono text-4xl font-bold text-[#1A1A2E] lg:text-5xl">
        {preco}
      </div>
      <div className="mt-1 text-sm text-gray-600">
        ou <span className="font-mono font-semibold text-[#1A1A2E]">{parcelas}</span> sem juros
      </div>

      <div className="mt-6">
        <CouponField />
      </div>

      <Link href="/loja/checkout">
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
  )
}
