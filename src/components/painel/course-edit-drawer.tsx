"use client"

import { useEffect, useState } from "react"
import { Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { CourseListItem } from "./course-list-table"

interface CourseEditDrawerProps {
  course: CourseListItem | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

export function CourseEditDrawer({
  course,
  open,
  onClose,
  onSaved,
}: CourseEditDrawerProps) {
  const [price, setPrice] = useState("")
  const [paymentType, setPaymentType] = useState<"ONE_TIME" | "MONTHLY">("ONE_TIME")
  const [description, setDescription] = useState("")
  const [isFeatured, setIsFeatured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!course) return
    setPrice(String(course.price).replace(".", ","))
    setPaymentType(course.paymentType)
    setDescription(course.description ?? "")
    setIsFeatured(course.isFeatured)
    setError(null)
  }, [course])

  if (!open || !course) return null

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    const numericPrice = parseFloat(price.replace(".", "").replace(",", "."))
    if (Number.isNaN(numericPrice) || numericPrice <= 0) {
      setError("Preço inválido")
      setSaving(false)
      return
    }

    try {
      const response = await fetch(`/api/painel/cursos/${course.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: numericPrice,
          paymentType,
          customDescription: description.trim() || null,
          isFeatured,
        }),
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setError(json?.error ?? "Erro ao salvar")
        return
      }
      onSaved()
    } catch {
      setError("Erro de rede")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <aside className="relative ml-auto flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">
              Editar curso
            </h2>
            <p className="text-xs text-gray-500">{course.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 space-y-5 px-6 py-6">
          <div>
            <Label htmlFor="edit-descricao">Descrição customizada</Label>
            <Textarea
              id="edit-descricao"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1.5"
              placeholder="Deixe em branco para usar a descrição padrão."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-preco">Preço (R$)</Label>
              <Input
                id="edit-preco"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1.5 font-mono"
                placeholder="0,00"
              />
            </div>
            <div>
              <Label htmlFor="edit-tipo">Tipo</Label>
              <select
                id="edit-tipo"
                value={paymentType}
                onChange={(e) =>
                  setPaymentType(e.target.value as "ONE_TIME" | "MONTHLY")
                }
                className="mt-1.5 h-9 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
              >
                <option value="ONE_TIME">Pagamento único</option>
                <option value="MONTHLY">Recorrente</option>
              </select>
            </div>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Destaque na vitrine
              </div>
              <div className="text-xs text-gray-500">
                Mostrar este curso em destaque.
              </div>
            </div>
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[var(--color-pmb-green)]"
            />
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <footer className="flex gap-3 border-t border-gray-200 px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </footer>
      </aside>
    </div>
  )
}
