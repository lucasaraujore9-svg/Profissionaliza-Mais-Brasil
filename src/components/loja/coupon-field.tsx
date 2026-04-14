"use client"

import { useState } from "react"
import { Tag, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export interface AppliedCoupon {
  code: string
  discountAmount: number
  finalPrice: number
  discountType: "PERCENTAGE" | "FIXED"
  discountValue: number
}

interface CouponFieldProps {
  courseId: string
  applied: AppliedCoupon | null
  onApply: (coupon: AppliedCoupon) => void
  onRemove: () => void
}

export function CouponField({ courseId, applied, onApply, onRemove }: CouponFieldProps) {
  const [code, setCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleApply() {
    if (code.trim().length === 0 || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/loja/cupom/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), courseId }),
      })
      const payload = await res.json()

      if (!res.ok || !payload.data) {
        setError(payload.error ?? "Cupom inválido")
        return
      }

      onApply(payload.data as AppliedCoupon)
      setCode("")
    } catch {
      setError("Erro ao validar cupom. Tente novamente.")
    } finally {
      setSubmitting(false)
    }
  }

  if (applied) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-600" />
            <div>
              <div className="font-mono font-semibold text-green-700">
                {applied.code}
              </div>
              <div className="text-xs text-green-600">
                Desconto de{" "}
                {applied.discountType === "PERCENTAGE"
                  ? `${applied.discountValue}%`
                  : `R$ ${applied.discountAmount.toFixed(2).replace(".", ",")}`}{" "}
                aplicado
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-green-700 transition-colors hover:bg-green-100"
            aria-label="Remover cupom"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
      <label
        htmlFor="cupom"
        className="flex items-center gap-1.5 text-xs font-medium text-gray-600"
      >
        <Tag className="h-3.5 w-3.5" />
        Tem um cupom de desconto?
      </label>
      <div className="mt-2 flex gap-2">
        <Input
          id="cupom"
          placeholder="DIGITE O CUPOM"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleApply()
            }
          }}
          disabled={submitting}
          className="h-9 font-mono text-sm uppercase"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={code.length === 0 || submitting}
          onClick={handleApply}
        >
          {submitting ? "..." : "Aplicar"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
