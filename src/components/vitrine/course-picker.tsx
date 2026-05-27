"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import {
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Search,
  X,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { CourseOption } from "./use-home-sections"
import { cn } from "@/lib/utils"

interface CoursePickerProps {
  selectedIds: string[]
  required: 4 | 8
  /** Pool de cursos disponíveis (já filtrado por categoria, se for o caso). */
  courses: CourseOption[]
  onChange: (ids: string[]) => void
  /** Texto explicativo curto exibido acima dos chips. */
  hint?: string
}

/**
 * Picker de cursos com:
 *  - busca por nome
 *  - chips dos selecionados reordenáveis por botões ↑↓
 *  - contador semafórico (faltam / pronto)
 *  - dropdown com resultados clicáveis (até 12 visíveis)
 */
export function CoursePicker({
  selectedIds,
  required,
  courses,
  onChange,
  hint,
}: CoursePickerProps) {
  const [query, setQuery] = useState("")
  const [openResults, setOpenResults] = useState(false)

  const byId = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  )

  const selected = useMemo(
    () =>
      selectedIds
        .map((id) => byId.get(id))
        .filter((c): c is CourseOption => Boolean(c)),
    [selectedIds, byId],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedSet = new Set(selectedIds)
    const all = courses.filter((c) => !selectedSet.has(c.id))
    if (!q) return all.slice(0, 12)
    return all
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 12)
  }, [courses, query, selectedIds])

  const status: "missing" | "almost" | "ready" | "over" =
    selected.length === required
      ? "ready"
      : selected.length > required
        ? "over"
        : selected.length === 0
          ? "missing"
          : "almost"

  function addCourse(id: string) {
    if (selectedIds.includes(id)) return
    if (selectedIds.length >= required) {
      // Substituir o último em vez de adicionar — atalho para "trocar".
      onChange([...selectedIds.slice(0, required - 1), id])
    } else {
      onChange([...selectedIds, id])
    }
    setQuery("")
  }

  function removeCourse(id: string) {
    onChange(selectedIds.filter((x) => x !== id))
  }

  function moveCourse(id: string, delta: -1 | 1) {
    const idx = selectedIds.indexOf(id)
    if (idx < 0) return
    const target = idx + delta
    if (target < 0 || target >= selectedIds.length) return
    const next = [...selectedIds]
    ;[next[idx], next[target]] = [next[target]!, next[idx]!]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}

      {/* Busca + dropdown */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 focus-within:border-[var(--color-pmb-green)] focus-within:ring-2 focus-within:ring-[var(--color-pmb-green)]/15">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpenResults(true)
            }}
            onFocus={() => setOpenResults(true)}
            onBlur={() => setTimeout(() => setOpenResults(false), 150)}
            placeholder="Buscar curso pelo nome..."
            className="h-7 border-0 px-0 shadow-none focus-visible:ring-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-zinc-400 hover:text-zinc-700"
              aria-label="Limpar busca"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {openResults && results.length > 0 && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
            {results.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addCourse(c.id)}
                className="flex w-full items-center gap-3 border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--color-pmb-mist)]"
              >
                <CourseThumb course={c} className="h-9 w-12 rounded" />
                <span className="line-clamp-1 flex-1 text-zinc-800">
                  {c.name}
                </span>
                <span className="rounded-full bg-[var(--color-pmb-green)]/10 px-2 py-0.5 text-[11px] font-bold text-[var(--color-pmb-green)]">
                  Adicionar
                </span>
              </button>
            ))}
          </div>
        )}
        {openResults && results.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-3 text-center text-xs text-zinc-500 shadow">
            {query ? "Nenhum curso encontrado" : "Nenhum curso disponível"}
          </div>
        )}
      </div>

      {/* Contador semafórico */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
          status === "ready" &&
            "border-emerald-200 bg-emerald-50 text-emerald-700",
          status === "almost" && "border-amber-200 bg-amber-50 text-amber-700",
          status === "missing" && "border-zinc-200 bg-zinc-50 text-zinc-600",
          status === "over" && "border-rose-200 bg-rose-50 text-rose-700",
        )}
      >
        {status === "ready" && (
          <>
            <Check className="h-4 w-4" aria-hidden />
            <span>
              {required} de {required} cursos selecionados — pronto pra publicar
            </span>
          </>
        )}
        {status === "almost" && (
          <span>
            {selected.length} de {required} selecionados — adicione mais{" "}
            {required - selected.length}
          </span>
        )}
        {status === "missing" && (
          <span>Selecione {required} cursos pra publicar essa seção</span>
        )}
        {status === "over" && (
          <span>
            Excedeu o limite — remova {selected.length - required} curso(s)
          </span>
        )}
      </div>

      {/* Chips dos selecionados */}
      {selected.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {selected.map((c, i) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-2"
            >
              <CourseThumb course={c} className="h-10 w-14 shrink-0 rounded" />
              <span className="line-clamp-2 flex-1 text-[13px] font-medium text-zinc-800">
                {c.name}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => moveCourse(c.id, -1)}
                    disabled={i === 0}
                    className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Mover para cima"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Mover para cima na home</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => moveCourse(c.id, 1)}
                    disabled={i === selected.length - 1}
                    className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Mover para baixo"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Mover para baixo na home</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    type="button"
                    onClick={() => removeCourse(c.id)}
                    className="grid h-7 w-7 place-items-center rounded text-rose-500 hover:bg-rose-50"
                    aria-label="Remover curso"
                  >
                    <X className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Remover este curso da seção</TooltipContent>
                </Tooltip>
              </div>
              {/* drag handle apenas visual em desktop, pra reforçar reorder */}
              <span className="hidden text-zinc-300 sm:block" aria-hidden>
                <GripVertical className="h-3.5 w-3.5" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CourseThumb({
  course,
  className,
}: {
  course: CourseOption
  className?: string
}) {
  if (!course.imageUrl) {
    return (
      <span
        className={cn(
          "grid place-items-center bg-zinc-100 text-[10px] font-bold text-zinc-400",
          className,
        )}
      >
        {course.name.slice(0, 2).toUpperCase()}
      </span>
    )
  }
  return (
    <span className={cn("relative overflow-hidden", className)}>
      <Image
        src={course.imageUrl}
        alt=""
        fill
        unoptimized
        sizes="56px"
        className="object-cover"
      />
    </span>
  )
}
