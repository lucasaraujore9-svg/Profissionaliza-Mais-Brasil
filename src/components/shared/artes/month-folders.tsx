"use client"

import { useEffect, useRef } from "react"
import { CalendarRange, Folder, FolderOpen, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { ART_MONTHS, filterByMonth, type MonthFilter } from "@/lib/artes/months"

// Pastas do banco de artes: Todas · Ano todo · Janeiro..Dezembro, com a
// contagem de cada uma e o mes corrente marcado. Usado no admin e no painel.
export function MonthFolders({
  arts,
  value,
  onChange,
  currentMonth,
}: {
  arts: Array<{ month: number | null }>
  value: MonthFilter
  onChange: (next: MonthFilter) => void
  currentMonth: number
}) {
  const tiles: Array<{ key: MonthFilter; label: string; count: number }> = [
    { key: "all", label: "Todas", count: arts.length },
    { key: "year", label: "Ano todo", count: filterByMonth(arts, "year").length },
    ...ART_MONTHS.map((label, i) => ({
      key: i + 1,
      label,
      count: filterByMonth(arts, i + 1).length,
    })),
  ]

  // No celular a faixa rola na horizontal: traz a pasta aberta para a vista
  // (o mes corrente costuma estar fora da tela inicial).
  // So a faixa rola — scrollIntoView arrastaria a pagina inteira junto.
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const scroller = scrollerRef.current
    const el = activeRef.current
    if (!scroller || !el) return
    scroller.scrollLeft = el.offsetLeft - (scroller.clientWidth - el.clientWidth) / 2
  }, [value])

  return (
    <div ref={scrollerRef} className="relative -mx-1 overflow-x-auto pb-1 sm:overflow-visible">
      <div
        className="flex min-w-max gap-2 px-1 sm:grid sm:min-w-0 sm:grid-cols-7"
        role="tablist"
        aria-label="Artes por mês"
      >
        {tiles.map((t) => {
          const active = value === t.key
          const isNow = t.key === currentMonth
          const Icon =
            t.key === "all" ? LayoutGrid : t.key === "year" ? CalendarRange : active ? FolderOpen : Folder
          return (
            <button
              key={String(t.key)}
              ref={active ? activeRef : undefined}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={t.count === 0 && !active}
              onClick={() => onChange(t.key)}
              className={cn(
                "relative flex w-24 flex-col items-start sm:w-auto gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)]/10"
                  : "border-gray-200 bg-white hover:border-gray-300",
                t.count === 0 && !active && "opacity-40",
                isNow && !active && "border-[var(--color-pmb-green)]/50",
              )}
            >
              {isNow && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--color-pmb-green)] px-1.5 py-px text-[9px] font-bold uppercase text-white">
                  Agora
                </span>
              )}
              <Icon
                className={cn(
                  "h-5 w-5",
                  active ? "text-[var(--color-pmb-green)]" : "text-gray-400",
                )}
              />
              <span
                className={cn(
                  "text-sm font-semibold",
                  active ? "text-[var(--color-pmb-green)]" : "text-gray-800",
                )}
              >
                {t.label}
              </span>
              <span className="text-xs text-gray-500">
                {t.count} arte{t.count === 1 ? "" : "s"}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
