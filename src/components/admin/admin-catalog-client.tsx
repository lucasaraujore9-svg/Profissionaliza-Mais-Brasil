"use client"

import { useCallback, useEffect, useState } from "react"
import { CatalogHeader, type CatalogLastSync } from "./catalog-header"
import { CatalogCourseGrid, type CatalogCourse } from "./catalog-course-grid"
import { CatalogSyncLog } from "./catalog-sync-log"
import type { SyncLogEntry } from "@/lib/catalog/sync-log"

interface CatalogResponse {
  courses: CatalogCourse[]
  lastSync: CatalogLastSync | null
  total: number
}

interface SyncLogResponse {
  logs: SyncLogEntry[]
}

export function AdminCatalogClient() {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [cr, lr] = await Promise.all([
        fetch("/api/admin/catalogo"),
        fetch("/api/admin/catalogo/sync-log"),
      ])
      const [cb, lb] = await Promise.all([cr.json(), lr.json()])
      if (!cr.ok) {
        setError(cb.error ?? "Falha ao carregar catálogo")
        return
      }
      if (!lr.ok) {
        setError(lb.error ?? "Falha ao carregar histórico")
        return
      }
      setCatalog(cb.data as CatalogResponse)
      setLogs((lb.data as SyncLogResponse).logs)
    } catch {
      setError("Erro de rede ao carregar catálogo")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading && !catalog) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando catálogo...
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
  if (!catalog) return null

  return (
    <div className="space-y-6">
      <CatalogHeader
        lastSync={catalog.lastSync}
        totalCourses={catalog.total}
        onSynced={load}
      />
      <CatalogCourseGrid courses={catalog.courses} />
      <CatalogSyncLog logs={logs} />
    </div>
  )
}
