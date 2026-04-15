"use client"

import { useState } from "react"
import { X, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateCouponModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function CreateCouponModal({
  open,
  onClose,
  onCreated,
}: CreateCouponModalProps) {
  const [code, setCode] = useState("")
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">(
    "PERCENTAGE",
  )
  const [discountValue, setDiscountValue] = useState("")
  const [validFrom, setValidFrom] = useState(todayIso())
  const [validUntil, setValidUntil] = useState(addDaysIso(30))
  const [maxUses, setMaxUses] = useState("")
  const [generating, setGenerating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  function resetForm() {
    setCode("")
    setDiscountType("PERCENTAGE")
    setDiscountValue("")
    setValidFrom(todayIso())
    setValidUntil(addDaysIso(30))
    setMaxUses("")
    setError(null)
  }

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch("/api/painel/cupons/generate-code", {
        method: "POST",
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao gerar código")
      } else {
        setCode(body.data.code)
      }
    } catch {
      setError("Erro de rede ao gerar código")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit() {
    const numericValue = Number(discountValue.replace(",", "."))
    if (!code.trim() || !Number.isFinite(numericValue) || numericValue <= 0) {
      setError("Preencha código e valor")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/painel/cupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: numericValue,
          maxUses: maxUses.trim() ? Number(maxUses) : null,
          validFrom: new Date(validFrom).toISOString(),
          validUntil: new Date(validUntil + "T23:59:59").toISOString(),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        const fields = body.fields as Record<string, string[]> | undefined
        const fieldError = fields ? Object.values(fields)[0]?.[0] : undefined
        setError(fieldError ?? body.error ?? "Falha ao criar cupom")
        return
      }
      resetForm()
      onCreated()
      onClose()
    } catch {
      setError("Erro de rede ao criar cupom")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
              Novo cupom de desconto
            </h2>
            <p className="text-xs text-gray-500">
              Configure regras de uso abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-6 py-6">
          <div>
            <Label htmlFor="cupom-codigo">Código</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                id="cupom-codigo"
                placeholder="EX: BEMVINDO10"
                className="font-mono uppercase"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {generating ? "..." : "Gerar"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cupom-tipo">Tipo de desconto</Label>
              <select
                id="cupom-tipo"
                value={discountType}
                onChange={(e) =>
                  setDiscountType(e.target.value as "PERCENTAGE" | "FIXED")
                }
                className="mt-1.5 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="PERCENTAGE">Porcentagem (%)</option>
                <option value="FIXED">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="cupom-valor">Valor</Label>
              <Input
                id="cupom-valor"
                placeholder={discountType === "PERCENTAGE" ? "10" : "50,00"}
                className="mt-1.5 font-mono"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cupom-inicio">Data início</Label>
              <Input
                id="cupom-inicio"
                type="date"
                className="mt-1.5"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cupom-fim">Data fim</Label>
              <Input
                id="cupom-fim"
                type="date"
                className="mt-1.5"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="cupom-max">Uso máximo</Label>
            <Input
              id="cupom-max"
              placeholder="Ilimitado"
              className="mt-1.5 font-mono"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Criando..." : "Criar cupom"}
          </Button>
        </footer>
      </div>
    </div>
  )
}
