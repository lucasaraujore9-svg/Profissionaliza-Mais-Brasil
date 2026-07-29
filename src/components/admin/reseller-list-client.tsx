"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ResellerStatsBar, type ResellerStats } from "./reseller-stats-bar"
import {
  ResellerListToolbar,
  type ResellerFilter,
} from "./reseller-list-toolbar"
import { ResellerTable, type ResellerRow } from "./reseller-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { StatCardsSkeleton, TableRowsSkeleton } from "@/components/shared/loading-skeletons"
import { NewResellerDialog } from "./new-reseller-dialog"

interface ListResponse {
  data: {
    stats: ResellerStats
    resellers: ResellerRow[]
    role: string
    /**
     * O que a tela pode mostrar, resolvido pelo guard na API. Gatear por papel
     * cru aqui deixava a UI incompleta a cada papel novo — e divergia do
     * backend, que decide por permissão.
     */
    can: { viewAll: boolean; governanca: boolean; create: boolean }
  }
}

interface ManagerOption {
  id: string
  name: string
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

  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [assignTenantId, setAssignTenantId] = useState<string | null>(null)
  const [assignValue, setAssignValue] = useState<string>("")
  const [saving, setSaving] = useState(false)

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

  // Carrega os gerentes de conta disponíveis. A rota já devolve só os papéis
  // elegíveis e ativos, sob a mesma permissão que autoriza a atribuição.
  const canAssign = data?.can?.governanca ?? false
  useEffect(() => {
    if (!canAssign) return
    fetch("/api/admin/revendedores/gerentes")
      .then((r) => r.json())
      .then((body) => {
        const rows = (body.data ?? []) as { id: string; name: string }[]
        setManagers(rows.map((u) => ({ id: u.id, name: u.name })))
      })
      .catch(() => setManagers([]))
  }, [canAssign])

  function openAssign(tenantId: string) {
    const row = data?.resellers.find((r) => r.id === tenantId)
    setAssignTenantId(tenantId)
    setAssignValue(row?.accountManagerId ?? "")
  }

  async function saveAssign() {
    if (!assignTenantId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/revendedores/${assignTenantId}/manager`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ managerId: assignValue || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? "Falha ao atribuir")
        return
      }
      toast.success("Gerente atualizado")
      setAssignTenantId(null)
      load()
    } finally {
      setSaving(false)
    }
  }

  const content = useMemo(() => {
    if (loading && !data) {
      return (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <TableRowsSkeleton rows={6} cols={5} />
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
    return (
      <ResellerTable
        rows={data.resellers}
        showManager={data.can.viewAll}
        onAssign={data.can.governanca ? openAssign : undefined}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, loading, error])

  return (
    <div className="space-y-6">
      {data ? (
        <ResellerStatsBar stats={data.stats} />
      ) : (
        <StatCardsSkeleton count={4} />
      )}
      <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <ResellerListToolbar
            query={query}
            filter={filter}
            onQueryChange={setQuery}
            onFilterChange={setFilter}
          />
        </div>
        {/* Mesma permissão que o POST /api/admin/revendedores exige. */}
        {data?.can?.create && <NewResellerDialog onCreated={load} />}
      </div>
      {content}

      <Dialog open={!!assignTenantId} onOpenChange={(o) => !o && setAssignTenantId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuir gerente de conta</DialogTitle>
            <DialogDescription>
              O gerente passará a ver este revendedor em seu painel.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Select value={assignValue || "__none__"} onValueChange={(v) => setAssignValue(v === "__none__" ? "" : (v ?? ""))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem gerente</SelectItem>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignTenantId(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={saveAssign}
              disabled={saving}
              className="bg-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-green-900)]"
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
