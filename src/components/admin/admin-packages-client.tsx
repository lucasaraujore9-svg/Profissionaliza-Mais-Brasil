"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, Plus, Pencil, Trash2, Layers, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CoverImageUpload } from "@/components/shared/cover-image-upload"

interface PackageRow {
  id: string
  name: string
  slug: string
  description: string | null
  coverImageUrl: string | null
  price: number
  featured: boolean
  enabled: boolean
  position: number
  courseCount: number
  courseNames: string[]
  courseIds: string[]
}

interface CourseOption {
  id: string
  nome: string
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  })
}

interface FormState {
  id: string | null
  name: string
  description: string
  coverImageUrl: string
  price: string
  featured: boolean
  enabled: boolean
  courseIds: string[]
}

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  description: "",
  coverImageUrl: "",
  price: "",
  featured: false,
  enabled: true,
  courseIds: [],
}

export function AdminPackagesClient() {
  const [packages, setPackages] = useState<PackageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [courses, setCourses] = useState<CourseOption[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [courseSearch, setCourseSearch] = useState("")

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/pacotes")
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar pacotes")
      setPackages(json.data as PackageRow[])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const loadCourses = useCallback(async () => {
    if (courses.length > 0) return
    try {
      const res = await fetch("/api/admin/pacotes/courses-lookup")
      const json = await res.json()
      if (res.ok) setCourses(json.data.courses as CourseOption[])
    } catch {
      // silencioso — o select fica vazio e o usuário recarrega
    }
  }, [courses.length])

  function openCreate() {
    setForm(EMPTY_FORM)
    setCourseSearch("")
    loadCourses()
    setDialogOpen(true)
  }

  function openEdit(p: PackageRow) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? "",
      coverImageUrl: p.coverImageUrl ?? "",
      price: String(p.price),
      featured: p.featured,
      enabled: p.enabled,
      courseIds: p.courseIds,
    })
    setCourseSearch("")
    loadCourses()
    setDialogOpen(true)
  }

  function toggleCourse(id: string) {
    setForm((f) =>
      f.courseIds.includes(id)
        ? { ...f, courseIds: f.courseIds.filter((c) => c !== id) }
        : { ...f, courseIds: [...f.courseIds, id] },
    )
  }

  async function handleSave() {
    const price = Number(form.price.replace(",", "."))
    if (form.name.trim().length < 3) {
      toast.error("Informe um nome com ao menos 3 caracteres.")
      return
    }
    if (!(price > 0)) {
      toast.error("Informe um preço maior que zero.")
      return
    }
    if (form.courseIds.length < 1) {
      toast.error("Selecione ao menos 1 curso.")
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        price,
        courseIds: form.courseIds,
        featured: form.featured,
        enabled: form.enabled,
      }
      const res = await fetch(
        form.id ? `/api/admin/pacotes/${form.id}` : "/api/admin/pacotes",
        {
          method: form.id ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Erro ao salvar")
      toast.success(form.id ? "Pacote atualizado." : "Pacote criado.")
      setDialogOpen(false)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: PackageRow) {
    if (!confirm(`Excluir o pacote "${p.name}"? As vendas já realizadas são preservadas.`)) {
      return
    }
    try {
      const res = await fetch(`/api/admin/pacotes/${p.id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? "Erro ao excluir")
      toast.success("Pacote excluído.")
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir")
    }
  }

  const filteredCourses = courseSearch.trim()
    ? courses.filter((c) =>
        c.nome.toLowerCase().includes(courseSearch.trim().toLowerCase()),
      )
    : courses

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Pacotes da PMB são distribuídos automaticamente às vitrines das revendas.
        </p>
        <Button onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" /> Novo pacote
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      ) : packages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-muted-foreground">
          <Layers className="mx-auto mb-3 h-8 w-8 opacity-40" />
          Nenhum pacote criado ainda. Clique em “Novo pacote”.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packages.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-[var(--color-pmb-green-900)]">
                    {p.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.courseCount} {p.courseCount === 1 ? "curso" : "cursos"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {p.featured && (
                    <Badge variant="secondary" className="gap-1">
                      <Star className="h-3 w-3" /> Destaque
                    </Badge>
                  )}
                  {!p.enabled && <Badge variant="outline">Inativo</Badge>}
                </div>
              </div>

              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                {p.courseNames.join(" • ")}
              </p>

              <div className="mt-3 font-mono text-lg font-extrabold text-[var(--color-pmb-green-900)]">
                {formatBRL(p.price)}
              </div>

              <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50"
                  onClick={() => handleDelete(p)}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar pacote" : "Novo pacote"}</DialogTitle>
            <DialogDescription>
              Monte um pacote com vários cursos vendidos por um valor único.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-name">Nome do pacote</Label>
              <Input
                id="pkg-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Combo Administração"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Preço (R$)</Label>
              <Input
                id="pkg-price"
                inputMode="decimal"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                placeholder="199,90"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Capa do pacote (opcional)</Label>
              <CoverImageUpload
                value={form.coverImageUrl || null}
                onChange={(url) =>
                  setForm((f) => ({ ...f, coverImageUrl: url ?? "" }))
                }
                endpoint="/api/admin/pacotes/capa"
                disabled={saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pkg-desc">Descrição (opcional)</Label>
              <Textarea
                id="pkg-desc"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="O que está incluso, para quem é, etc."
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.featured}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, featured: v }))}
                />
                Destaque
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                />
                Ativo
              </label>
            </div>

            <div className="space-y-2">
              <Label>
                Cursos do pacote ({form.courseIds.length} selecionado
                {form.courseIds.length === 1 ? "" : "s"})
              </Label>
              <Input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Buscar curso…"
              />
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200">
                {courses.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin" />
                    Carregando cursos…
                  </div>
                ) : filteredCourses.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Nenhum curso encontrado.
                  </div>
                ) : (
                  filteredCourses.map((c) => {
                    const checked = form.courseIds.includes(c.id)
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-0 hover:bg-gray-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCourse(c.id)}
                          className="h-4 w-4 accent-[var(--color-pmb-green,#025918)]"
                        />
                        <span className="truncate">{c.nome}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {form.id ? "Salvar" : "Criar pacote"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
