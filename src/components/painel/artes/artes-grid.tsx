"use client"

import Image from "next/image"
import { useMemo, useState } from "react"
import { Check, Download, Images as ImagesIcon, X, BadgeDollarSign } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ArtItem, TenantBrand } from "@/lib/artes/types"
import { ArteDownloadDialog } from "./arte-download-dialog"
import { BatchDownloadDialog } from "./batch-download-dialog"

export function ArtesGrid({ arts, brand }: { arts: ArtItem[]; brand: TenantBrand }) {
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<ArtItem | null>(null)
  const [batchOpen, setBatchOpen] = useState(false)

  const categories = useMemo(
    () =>
      Array.from(
        new Set(arts.map((a) => a.category).filter((c): c is string => !!c)),
      ).sort(),
    [arts],
  )

  const visible = useMemo(
    () => (category ? arts.filter((a) => a.category === category) : arts),
    [arts, category],
  )

  const selecting = selected.size > 0

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (arts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 px-6 py-16 text-center">
        <ImagesIcon className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 font-medium text-gray-700">Nenhuma arte disponível ainda</p>
        <p className="mt-1 text-sm text-gray-500">
          As artes publicadas pela equipe aparecem aqui, prontas para personalizar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-20">
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              category === null
                ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green)]"
                : "border-gray-200 text-gray-600 hover:border-gray-300",
            )}
          >
            Todas ({arts.length})
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c === category ? null : c)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                category === c
                  ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/10 text-[var(--color-pmb-green)]"
                  : "border-gray-200 text-gray-600 hover:border-gray-300",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((art) => {
          const isSelected = selected.has(art.id)
          return (
            <div
              key={art.id}
              className={cn(
                "group relative overflow-hidden rounded-xl border bg-white transition-shadow",
                isSelected
                  ? "border-[var(--color-pmb-green)] ring-2 ring-[var(--color-pmb-green)]/30"
                  : "border-gray-200 hover:shadow-md",
              )}
            >
              <button
                type="button"
                onClick={() => (selecting ? toggleSelect(art.id) : setPreview(art))}
                className="block w-full text-left"
              >
                <div className="relative aspect-square bg-gray-100">
                  <Image
                    src={art.url}
                    alt={art.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 25vw"
                    className="object-contain"
                    unoptimized
                  />
                  {art.hasPrice && (
                    <Badge
                      variant="outline"
                      className="absolute right-2 top-2 gap-1 bg-white/90 text-emerald-700"
                    >
                      <BadgeDollarSign className="h-3 w-3" /> Com valor
                    </Badge>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-semibold text-gray-900" title={art.title}>
                    {art.title}
                  </p>
                  {art.category && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">{art.category}</p>
                  )}
                </div>
              </button>

              {/* Check de seleção (multi-select) */}
              <button
                type="button"
                onClick={() => toggleSelect(art.id)}
                aria-label={isSelected ? "Remover da seleção" : "Adicionar à seleção"}
                className={cn(
                  "absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                  isSelected
                    ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                    : "border-gray-300 bg-white/90 text-transparent hover:border-gray-400 group-hover:text-gray-300",
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Barra fixa de seleção */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{selected.size}</span> arte
              {selected.size === 1 ? "" : "s"} selecionada{selected.size === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                <X className="mr-1.5 h-4 w-4" /> Limpar
              </Button>
              <Button size="sm" onClick={() => setBatchOpen(true)}>
                <Download className="mr-1.5 h-4 w-4" /> Baixar selecionadas (.zip)
              </Button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <ArteDownloadDialog art={preview} brand={brand} onClose={() => setPreview(null)} />
      )}

      {batchOpen && (
        <BatchDownloadDialog
          arts={arts.filter((a) => selected.has(a.id))}
          brand={brand}
          onClose={() => setBatchOpen(false)}
        />
      )}
    </div>
  )
}
