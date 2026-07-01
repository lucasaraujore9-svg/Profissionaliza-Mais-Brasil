"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { isPeriodPreset, type PeriodPreset } from "@/lib/reports/period"
import type { PeriodValue } from "./period-filter"

/**
 * Estado de filtros do hub de BI sincronizado com a URL (`?period=&from=&to=`).
 * Deep-linkável, compartilhável e à prova de back-button. A ABA em si vive no
 * segmento de rota `[tab]`, então aqui só cuidamos dos filtros. Espelha o
 * padrão `config-tabs.tsx` (`router.replace(..., { scroll:false })`).
 */
export function useReportQueryState(): {
  period: PeriodValue
  setPeriod: (v: PeriodValue) => void
  /** Query string atual dos filtros (para montar hrefs de export). */
  queryString: string
} {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const period = useMemo<PeriodValue>(() => {
    const from = params.get("from") ?? undefined
    const to = params.get("to") ?? undefined
    if (from && to) return { preset: "custom", from, to }
    const raw = params.get("period")
    const preset: PeriodPreset =
      isPeriodPreset(raw) && raw !== "custom" ? raw : "30d"
    return { preset }
  }, [params])

  const setPeriod = useCallback(
    (v: PeriodValue) => {
      const next = new URLSearchParams(params)
      // Zera período/intervalo antes de aplicar o novo valor.
      next.delete("period")
      next.delete("from")
      next.delete("to")
      if (v.preset === "custom") {
        if (v.from) next.set("from", v.from)
        if (v.to) next.set("to", v.to)
        // Só marca custom quando o intervalo está completo (evita fetch parcial).
        if (v.from && v.to) next.set("period", "custom")
      } else {
        next.set("period", v.preset)
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [params, pathname, router],
  )

  return { period, setPeriod, queryString: params.toString() }
}
