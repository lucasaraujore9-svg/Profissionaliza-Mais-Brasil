"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, Plus, Pencil, Trash2, X, Check } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface Category {
  id: string
  name: string
  slug: string
  displayOrder: number
  isActive: boolean
  description: string | null
  courseCount: number
}

interface CategoryManagerDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** Chamado depois de qualquer create/update/delete bem-sucedido. */
  onChanged?: () => void
}

interface EditState {
  id: string
  name: string
  slug: string
  displayOrder: number
  isActive: boolean
}

export function CategoryManagerDialog({
  open,
  onOpenChange,
  onChanged,
}: CategoryManagerDialogProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/catalogo/categorias")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar categorias")
      setCategories(json.data as Category[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  async function handleCreate() {
    const name = newName.trim()
    if (name.length < 2) {
      toast.error("Informe um nome com pelo menos 2 caracteres")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/admin/catalogo/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Falha ao criar")
      toast.success("Categoria criada")
      setNewName("")
      await refresh()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar")
    } finally {
      setCreating(false)
    }
  }

  async function handleSaveEdit() {
    if (!editing) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/admin/catalogo/categorias/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editing.name.trim(),
          slug: editing.slug.trim(),
          displayOrder: editing.displayOrder,
          isActive: editing.isActive,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Falha ao salvar")
      toast.success("Categoria atualizada")
      setEditing(null)
      await refresh()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar")
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(cat: Category) {
    const msg =
      cat.courseCount > 0
        ? `Esta categoria tem ${cat.courseCount} curso(s) vinculado(s). Eles ficarão SEM categoria. Continuar?`
        : "Apagar esta categoria?"
    if (!window.confirm(msg)) return
    try {
      const res = await fetch(`/api/admin/catalogo/categorias/${cat.id}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Falha ao apagar")
      toast.success("Categoria removida")
      await refresh()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao apagar")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gerenciar categorias do catálogo</DialogTitle>
          <DialogDescription>
            Categorias aparecem no menu público, footer e filtros do catálogo.
            Cursos vinculados a uma categoria removida ficam &ldquo;sem categoria&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da nova categoria (ex: Beleza e Estética)"
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || newName.trim().length < 2}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? "Criando…" : "Criar"}
          </button>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : categories.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Nenhuma categoria cadastrada. Crie a primeira acima.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {categories.map((cat) => {
                const isEditing = editing?.id === cat.id
                return (
                  <li key={cat.id} className="px-4 py-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid gap-2 md:grid-cols-[1fr_180px_80px]">
                          <input
                            value={editing.name}
                            onChange={(e) =>
                              setEditing({ ...editing, name: e.target.value })
                            }
                            placeholder="Nome"
                            className="rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                          />
                          <input
                            value={editing.slug}
                            onChange={(e) =>
                              setEditing({ ...editing, slug: e.target.value })
                            }
                            placeholder="slug-url"
                            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs"
                          />
                          <input
                            type="number"
                            value={editing.displayOrder}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                displayOrder: Number(e.target.value || 0),
                              })
                            }
                            placeholder="Ordem"
                            className="rounded-md border border-gray-200 px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={editing.isActive}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  isActive: e.target.checked,
                                })
                              }
                            />
                            Ativa (aparece nos menus públicos)
                          </label>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditing(null)}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
                            >
                              <X className="h-3 w-3" /> Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={savingEdit}
                              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-pmb-green)] px-2 py-1 text-xs font-bold text-white disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              {savingEdit ? "Salvando…" : "Salvar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-pmb-green-900)]">
                            {cat.name}
                            {!cat.isActive && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                                Inativa
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            /cursos?categoria={cat.slug} · ordem {cat.displayOrder} · {cat.courseCount}{" "}
                            curso{cat.courseCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setEditing({
                                id: cat.id,
                                name: cat.name,
                                slug: cat.slug,
                                displayOrder: cat.displayOrder,
                                isActive: cat.isActive,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          >
                            <Pencil className="h-3 w-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(cat)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            Apagar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
