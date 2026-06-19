"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Layers, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { CoverImageUpload } from "@/components/shared/cover-image-upload"

interface PmbPackage {
  id: string
  name: string
  slug: string
  description: string | null
  coverImageUrl: string | null
  basePrice: number
  effectivePrice: number
  hasCustomPrice: boolean
  isVisible: boolean
  isFeatured: boolean
  courseCount: number
  courseNames: string[]
}

interface OwnPackage {
  id: string
  name: string
  slug: string
  description: string | null
  coverImageUrl: string | null
  price: number
  enabled: boolean
  featured: boolean
  courseCount: number
  courseNames: string[]
}

interface LookupCourse {
  id: string
  nome: string
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function PainelPackagesClient() {
  const [pmb, setPmb] = useState<PmbPackage[] | null>(null)
  const [own, setOwn] = useState<OwnPackage[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<OwnPackage | "new" | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch("/api/painel/pacotes")
      const json = await res.json()
      if (!res.ok) {
        setLoadError(json?.error ?? "Erro ao carregar pacotes")
        return
      }
      setPmb(json.data.pmbPackages as PmbPackage[])
      setOwn(json.data.ownPackages as OwnPackage[])
    } catch {
      setLoadError("Erro de conexão ao carregar pacotes")
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    )
  }

  if (!pmb || !own) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando pacotes...
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {/* ── Pacotes da PMB ── */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold text-[var(--color-pmb-green-900,#022c0c)]">
            Pacotes da Profissionaliza
          </h2>
          <p className="text-sm text-gray-500">
            Disponibilizados automaticamente para a sua vitrine. Defina o seu preço,
            destaque ou remova da sua loja. Os cursos do pacote são definidos pela
            Profissionaliza.
          </p>
        </div>
        {pmb.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Nenhum pacote da Profissionaliza disponível no momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pmb.map((p) => (
              <PmbPackageCard key={p.id} pkg={p} onSaved={load} />
            ))}
          </div>
        )}
      </section>

      {/* ── Meus pacotes ── */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--color-pmb-green-900,#022c0c)]">
              Meus pacotes
            </h2>
            <p className="text-sm text-gray-500">
              Pacotes criados pela sua unidade. Você define os cursos e o preço.
            </p>
          </div>
          <Button
            onClick={() => setEditing("new")}
            className="shrink-0 bg-[var(--color-pmb-green,#025918)] text-white hover:bg-[var(--color-pmb-green-700,#024514)]"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Novo pacote
          </Button>
        </div>
        {own.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Você ainda não criou nenhum pacote.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {own.map((p) => (
              <OwnPackageCard
                key={p.id}
                pkg={p}
                onEdit={() => setEditing(p)}
                onChanged={load}
              />
            ))}
          </div>
        )}
      </section>

      {editing && (
        <OwnPackageDialog
          pkg={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Card de pacote PMB (override local da revenda)
// ─────────────────────────────────────────────────────────────────────────

function PmbPackageCard({ pkg, onSaved }: { pkg: PmbPackage; onSaved: () => void }) {
  const [priceInput, setPriceInput] = useState(
    pkg.hasCustomPrice ? String(pkg.effectivePrice) : "",
  )
  const [saving, setSaving] = useState(false)

  async function patch(body: Record<string, unknown>) {
    setSaving(true)
    try {
      const res = await fetch(`/api/painel/pacotes/pmb/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? "Falha ao salvar")
        return
      }
      toast.success("Pacote atualizado")
      onSaved()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setSaving(false)
    }
  }

  function savePrice() {
    const trimmed = priceInput.trim().replace(",", ".")
    if (trimmed === "") {
      void patch({ price: null })
      return
    }
    const n = Number(trimmed)
    if (!(n > 0)) {
      toast.error("Informe um preço válido")
      return
    }
    void patch({ price: n })
  }

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-50,#eefbe7)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-pmb-green-700,#024514)]">
          <Layers className="h-3 w-3" /> Pacote PMB
        </span>
        {!pkg.isVisible && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            Oculto na sua vitrine
          </span>
        )}
      </div>
      <h3 className="mt-2 text-[15px] font-bold leading-snug text-[var(--color-pmb-green-900,#022c0c)]">
        {pkg.name}
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        {pkg.courseCount} {pkg.courseCount === 1 ? "curso" : "cursos"} • preço sugerido{" "}
        {formatBRL(pkg.basePrice)}
      </p>

      <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
        <div className="space-y-1.5">
          <Label htmlFor={`price-${pkg.id}`} className="text-xs">
            Seu preço (deixe vazio p/ usar o sugerido)
          </Label>
          <div className="flex gap-2">
            <Input
              id={`price-${pkg.id}`}
              inputMode="decimal"
              placeholder={String(pkg.basePrice)}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              disabled={saving}
            />
            <Button
              variant="outline"
              onClick={savePrice}
              disabled={saving}
              className="shrink-0"
            >
              Salvar
            </Button>
          </div>
        </div>

        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-gray-700">Visível na minha vitrine</span>
          <Switch
            checked={pkg.isVisible}
            onCheckedChange={(v) => patch({ isVisible: v })}
            disabled={saving}
          />
        </label>
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-gray-700">Destacar na vitrine</span>
          <Switch
            checked={pkg.isFeatured}
            onCheckedChange={(v) => patch({ isFeatured: v })}
            disabled={saving}
          />
        </label>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Card de pacote próprio
// ─────────────────────────────────────────────────────────────────────────

function OwnPackageCard({
  pkg,
  onEdit,
  onChanged,
}: {
  pkg: OwnPackage
  onEdit: () => void
  onChanged: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  async function remove() {
    if (!confirm(`Remover o pacote "${pkg.name}"?`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/painel/pacotes/${pkg.id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? "Falha ao remover")
        return
      }
      toast.success("Pacote removido")
      onChanged()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-pmb-lime-50,#eefbe7)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-pmb-green-700,#024514)]">
          <Layers className="h-3 w-3" /> Meu pacote
        </span>
        {!pkg.enabled && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
            Desativado
          </span>
        )}
      </div>
      <h3 className="mt-2 text-[15px] font-bold leading-snug text-[var(--color-pmb-green-900,#022c0c)]">
        {pkg.name}
      </h3>
      <p className="mt-0.5 text-xs text-gray-500">
        {pkg.courseCount} {pkg.courseCount === 1 ? "curso" : "cursos"}
      </p>
      <div className="mt-2 font-mono text-lg font-extrabold text-[var(--color-pmb-green-900,#022c0c)]">
        {formatBRL(pkg.price)}
      </div>

      <div className="mt-4 flex gap-2 border-t border-gray-100 pt-4">
        <Button variant="outline" onClick={onEdit} className="flex-1">
          <Pencil className="mr-1.5 h-4 w-4" /> Editar
        </Button>
        <Button
          variant="outline"
          onClick={remove}
          disabled={deleting}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Dialog de criação/edição de pacote próprio
// ─────────────────────────────────────────────────────────────────────────

function OwnPackageDialog({
  pkg,
  onClose,
  onSaved,
}: {
  pkg: OwnPackage | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = pkg !== null
  const [name, setName] = useState(pkg?.name ?? "")
  const [description, setDescription] = useState(pkg?.description ?? "")
  const [coverImageUrl, setCoverImageUrl] = useState(pkg?.coverImageUrl ?? "")
  const [price, setPrice] = useState(pkg ? String(pkg.price) : "")
  const [featured, setFeatured] = useState(pkg?.featured ?? false)
  const [courseIds, setCourseIds] = useState<string[]>([])
  const [courses, setCourses] = useState<LookupCourse[] | null>(null)
  const [courseSearch, setCourseSearch] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      const lookup = await fetch("/api/painel/pacotes/courses-lookup")
        .then((r) => r.json())
        .catch(() => null)
      if (!cancelled && lookup?.data?.courses) {
        setCourses(lookup.data.courses as LookupCourse[])
      }
      if (isEdit && pkg) {
        const detail = await fetch(`/api/painel/pacotes/${pkg.id}`)
          .then((r) => r.json())
          .catch(() => null)
        if (!cancelled && detail?.data?.courseIds) {
          setCourseIds(detail.data.courseIds as string[])
        }
      }
    }
    void init()
    return () => {
      cancelled = true
    }
  }, [isEdit, pkg])

  const filteredCourses = useMemo(() => {
    if (!courses) return []
    const q = courseSearch.trim().toLowerCase()
    if (!q) return courses
    return courses.filter((c) => c.nome.toLowerCase().includes(q))
  }, [courses, courseSearch])

  function toggleCourse(id: string) {
    setCourseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  async function save() {
    const n = Number(price.trim().replace(",", "."))
    if (name.trim().length < 3) {
      toast.error("Informe um nome com ao menos 3 caracteres")
      return
    }
    if (!(n > 0)) {
      toast.error("Informe um preço válido")
      return
    }
    if (courseIds.length === 0) {
      toast.error("Selecione ao menos 1 curso")
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        coverImageUrl: coverImageUrl.trim() || null,
        price: n,
        courseIds,
        featured,
      }
      const res = await fetch(
        isEdit ? `/api/painel/pacotes/${pkg!.id}` : "/api/painel/pacotes",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.error ?? "Falha ao salvar pacote")
        return
      }
      toast.success(isEdit ? "Pacote atualizado" : "Pacote criado")
      onSaved()
    } catch {
      toast.error("Erro de conexão")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar pacote" : "Novo pacote"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-name">Nome do pacote</Label>
            <Input
              id="pkg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Combo Administração"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pkg-desc">Descrição (opcional)</Label>
            <Textarea
              id="pkg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={saving}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Preço (R$)</Label>
              <Input
                id="pkg-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="199,90"
                disabled={saving}
              />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={featured} onCheckedChange={setFeatured} disabled={saving} />
                <span className="text-gray-700">Destaque</span>
              </label>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Capa do pacote (opcional)</Label>
            <CoverImageUpload
              value={coverImageUrl || null}
              onChange={(url) => setCoverImageUrl(url ?? "")}
              endpoint="/api/painel/pacotes/capa"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Cursos do pacote ({courseIds.length} selecionados)</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Buscar curso..."
                className="pl-9"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-gray-200 p-2">
              {courses === null ? (
                <div className="flex items-center justify-center py-6 text-sm text-gray-400">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando cursos...
                </div>
              ) : filteredCourses.length === 0 ? (
                <p className="py-4 text-center text-sm text-gray-400">Nenhum curso encontrado.</p>
              ) : (
                filteredCourses.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={courseIds.includes(c.id)}
                      onChange={() => toggleCourse(c.id)}
                      className="h-4 w-4 accent-[var(--color-pmb-green,#025918)]"
                    />
                    <span className="text-gray-700">{c.nome}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="bg-[var(--color-pmb-green,#025918)] text-white hover:bg-[var(--color-pmb-green-700,#024514)]"
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Salvar" : "Criar pacote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
