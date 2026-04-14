"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ResellerStatsBar, type ResellerStats } from "./reseller-stats-bar"
import {
  ResellerListToolbar,
  type ResellerFilter,
} from "./reseller-list-toolbar"
import { ResellerTable, type ResellerRow } from "./reseller-table"

interface ListResponse {
  data: {
    stats: ResellerStats
    resellers: ResellerRow[]
  }
}

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const h = setTimeout(() => setV(value), delay)
    return () => clearTimeout(h)
  }, [value, delay])
  return v
}

export function ResellerListClient() {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<ResellerFilter>("TODOS")
  const [data, setData] = useState<ListResponse["data"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounced(query, 350)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim())
    if (filter !== "TODOS") params.set("status", filter)
    try {
      const res = await fetch(`/api/admin/revendedores?${params.toString()}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar revendedores")
        return
      }
      setData(body.data)
    } catch {
      setError("Erro de rede ao carregar revendedores")
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, filter])

  useEffect(() => {
    load()
  }, [load])

  const content = useMemo(() => {
    if (loading && !data) {
      return (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
          Carregando revendedores...
        </div>
      )
    }
    if (error) {
      return (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      )
    }
    if (!data) return null
    return <ResellerTable rows={data.resellers} />
  }, [data, loading, error])

  return (
    <div className="space-y-6">
      <ResellerStatsBar
        stats={
          data?.stats ?? {
            total: 0,
            active: 0,
            pending: 0,
            suspended: 0,
            cancelled: 0,
          }
        }
      />
      <ResellerListToolbar
        query={query}
        filter={filter}
        onQueryChange={setQuery}
        onFilterChange={setFilter}
      />
      {content}
    </div>
  )
}
