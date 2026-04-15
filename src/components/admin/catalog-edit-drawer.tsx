"use client"

import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"

export interface CatalogEditDrawerProps {
  courseId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}

interface CourseDetail {
  id: string
  nome: string
  precoOriginal: number | null
  precoVitrineMain: number | null
  destaqueHome: boolean
  ordemHome: number | null
  descricaoOverride: string | null
  capaOverride: string | null
  categoriaLoja: string | null
  status: string
}

export function CatalogEditDrawer({ courseId, open, onOpenChange, onSaved }: CatalogEditDrawerProps) {
  const [detail, setDetail] = useState<CourseDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!courseId || !open) return
    setError(null)
    setDetail(null)
    fetch(`/api/admin/catalogo/${courseId}`)
      .then((r) => r.json())
      .then((b) => {
        if (b.data) setDetail(b.data as CourseDetail)
        else setError(b.error ?? "Falha ao carregar curso")
      })
      .catch(() => setError("Erro de rede"))
  }, [courseId, open])

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!detail) return
    setSaving(true)
    setError(null)
    const body = {
      precoVitrineMain: detail.precoVitrineMain,
      destaqueHome: detail.destaqueHome,
      ordemHome: detail.ordemHome,
      descricaoOverride: detail.descricaoOverride,
      capaOverride: detail.capaOverride,
      categoriaLoja: detail.categoriaLoja,
      status: detail.status === "INATIVO" ? "INATIVO" : "ATIVO",
    }
    const res = await fetch(`/api/admin/catalogo/${detail.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      setError(b.error ?? "Falha ao salvar")
      return
    }
    onSaved()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="px-6 pt-6">
          <SheetTitle>Editar curso da vitrine PMB</SheetTitle>
          <SheetDescription>
            Estes ajustes aplicam apenas na vitrine principal. Revendedores definem o proprio preco.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-8">
          {!detail && !error ? (
            <div className="mt-8 text-sm text-gray-500">Carregando...</div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {detail ? (
            <form onSubmit={handleSave} className="mt-6 space-y-5">
            <div>
              <label className="text-xs font-semibold text-gray-700">Curso</label>
              <p className="mt-1 text-sm font-medium text-[var(--color-pmb-green-900)]">{detail.nome}</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">
                Preco vitrine principal (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={detail.precoVitrineMain ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    precoVitrineMain: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
                placeholder={detail.precoOriginal ? String(detail.precoOriginal) : "Ex: 197.00"}
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Preco usado na vitrine PMB. Revendedores definem o proprio.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                id="destaque-home"
                type="checkbox"
                checked={detail.destaqueHome}
                onChange={(e) => setDetail({ ...detail, destaqueHome: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300"
              />
              <label htmlFor="destaque-home" className="text-sm text-gray-700">
                Destaque na home
              </label>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Ordem na home</label>
              <input
                type="number"
                value={detail.ordemHome ?? ""}
                onChange={(e) =>
                  setDetail({ ...detail, ordemHome: e.target.value === "" ? null : Number(e.target.value) })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: 1"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Categoria loja</label>
              <input
                type="text"
                value={detail.categoriaLoja ?? ""}
                onChange={(e) =>
                  setDetail({ ...detail, categoriaLoja: e.target.value === "" ? null : e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Capa (URL Supabase)</label>
              <input
                type="url"
                value={detail.capaOverride ?? ""}
                onChange={(e) =>
                  setDetail({ ...detail, capaOverride: e.target.value === "" ? null : e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Descricao override</label>
              <textarea
                rows={4}
                value={detail.descricaoOverride ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    descricaoOverride: e.target.value === "" ? null : e.target.value,
                  })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-700">Status</label>
              <select
                value={detail.status}
                onChange={(e) => setDetail({ ...detail, status: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
