"use client"

import { useState } from "react"
import {
  Calendar,
  CircleDollarSign,
  Percent,
  Sparkles,
  Tag,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
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
      setError("Preencha o código e o valor do desconto.")
      return
    }
    if (discountType === "PERCENTAGE" && numericValue > 100) {
      setError("O desconto em porcentagem não pode ser maior que 100%.")
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

  // Preview values
  const numericValue = Number(discountValue.replace(",", "."))
  const hasValidPreview = code.trim().length > 0 && Number.isFinite(numericValue) && numericValue > 0
  const previewDiscount =
    discountType === "PERCENTAGE"
      ? `${numericValue}% OFF`
      : `${formatBRL(numericValue)} OFF`

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-3 border-b border-gray-200 px-6 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <Tag className="h-4 w-4" />
          </span>
          <div>
            <DialogTitle className="text-base font-semibold text-[var(--color-pmb-green-900)]">
              Criar novo cupom
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Ofereça desconto para atrair novos alunos.
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body com scroll quando necessário */}
        <div className="space-y-6 overflow-y-auto px-6 py-6">
          {/* Preview do cupom */}
          <div className="rounded-xl border border-dashed border-[rgba(2,89,24,0.25)] bg-[var(--color-pmb-mist)]/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-pmb-green)]">
              Pré-visualização
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-pmb-green)]/30 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-pmb-green)] text-white">
                  <Tag className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-mono text-base font-bold uppercase tracking-wide text-[var(--color-pmb-green-900)]">
                    {code || "SEUCUPOM"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {hasValidPreview
                      ? `Válido até ${new Date(validUntil).toLocaleDateString("pt-BR")}`
                      : "Preencha código e valor para visualizar"}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[var(--color-pmb-gold)] px-3 py-1 font-mono text-sm font-bold text-[var(--color-pmb-green-900)]">
                {hasValidPreview ? previewDiscount : "—"}
              </span>
            </div>
          </div>

          {/* Seção: Código */}
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              1. Código do cupom
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Este é o código que seus alunos vão digitar no checkout.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                id="cupom-codigo"
                placeholder="EX: BEMVINDO10"
                className="font-mono uppercase tracking-wider"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                aria-label="Código do cupom"
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
          </section>

          {/* Seção: Tipo de desconto */}
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              2. Tipo e valor do desconto
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Escolha entre porcentagem ou valor em reais.
            </p>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setDiscountType("PERCENTAGE")}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                  discountType === "PERCENTAGE"
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)] ring-2 ring-[var(--color-pmb-lime)]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                aria-pressed={discountType === "PERCENTAGE"}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    discountType === "PERCENTAGE"
                      ? "bg-[var(--color-pmb-green)] text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <Percent className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    Porcentagem
                  </p>
                  <p className="text-[11px] text-gray-500">Ex: 10% off no curso</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDiscountType("FIXED")}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                  discountType === "FIXED"
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-lime-50)] ring-2 ring-[var(--color-pmb-lime)]"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
                aria-pressed={discountType === "FIXED"}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    discountType === "FIXED"
                      ? "bg-[var(--color-pmb-green)] text-white"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <CircleDollarSign className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    Valor fixo
                  </p>
                  <p className="text-[11px] text-gray-500">Ex: R$ 50 off no curso</p>
                </div>
              </button>
            </div>

            <div className="mt-3">
              <Label htmlFor="cupom-valor" className="text-xs text-gray-600">
                {discountType === "PERCENTAGE"
                  ? "Quanto por cento de desconto?"
                  : "Quantos reais de desconto?"}
              </Label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">
                  {discountType === "PERCENTAGE" ? "%" : "R$"}
                </span>
                <Input
                  id="cupom-valor"
                  placeholder={discountType === "PERCENTAGE" ? "10" : "50,00"}
                  className="pl-10 font-mono"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            </div>
          </section>

          {/* Seção: Validade */}
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              <Calendar className="mr-1 inline-block h-4 w-4" />
              3. Período de validade
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              O cupom só funciona dentro deste intervalo.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cupom-inicio" className="text-xs text-gray-600">
                  Começa em
                </Label>
                <Input
                  id="cupom-inicio"
                  type="date"
                  className="mt-1.5"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="cupom-fim" className="text-xs text-gray-600">
                  Termina em
                </Label>
                <Input
                  id="cupom-fim"
                  type="date"
                  className="mt-1.5"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Seção: Limite de uso */}
          <section>
            <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
              <Users className="mr-1 inline-block h-4 w-4" />
              4. Quantas pessoas podem usar?
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Limite o número total de usos ou deixe em branco para uso ilimitado.
            </p>
            <Input
              id="cupom-max"
              placeholder="Deixe vazio = uso ilimitado"
              className="mt-3 font-mono"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </section>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 flex gap-3 border-t border-gray-200 bg-transparent px-6 py-4 sm:justify-stretch">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
