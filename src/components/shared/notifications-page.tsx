"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  Loader2,
  RefreshCcw,
  Search,
} from "lucide-react"
import { NotificationPreferencesPanel } from "./notification-preferences"
import { PageHeader } from "@/components/painel/page-header"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TableRowsSkeleton } from "@/components/shared/loading-skeletons"
import { EmptyState } from "@/components/shared/empty-state"

interface Notification {
  id: string
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR"
  title: string
  body: string | null
  category: string | null
  href: string | null
  readAt: string | null
  createdAt: string
}

const LEVEL_ICON: Record<Notification["level"], React.ComponentType<{ className?: string }>> = {
  INFO: Info,
  SUCCESS: CircleCheck,
  WARNING: CircleAlert,
  ERROR: CircleX,
}

const LEVEL_CLASS: Record<Notification["level"], string> = {
  INFO: "text-sky-600 bg-sky-50 ring-sky-100",
  SUCCESS: "text-emerald-600 bg-emerald-50 ring-emerald-100",
  WARNING: "text-amber-600 bg-amber-50 ring-amber-100",
  ERROR: "text-rose-600 bg-rose-50 ring-rose-100",
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type Filter = "all" | "unread"
type Tab = "feed" | "preferences"

export function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [category, setCategory] = useState<string>("all")
  const [query, setQuery] = useState("")
  const [marking, setMarking] = useState(false)
  const [tab, setTab] = useState<Tab>("feed")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/notifications?limit=200", {
        cache: "no-store",
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error ?? "Falha ao carregar notificações")
        return
      }
      setItems(body.data?.items ?? [])
    } catch {
      setError("Erro de rede ao carregar notificações")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const n of items) if (n.category) set.add(n.category)
    return ["all", ...[...set].sort()]
  }, [items])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((n) => {
      if (filter === "unread" && n.readAt !== null) return false
      if (category !== "all" && n.category !== category) return false
      if (
        q &&
        !n.title.toLowerCase().includes(q) &&
        !(n.body?.toLowerCase().includes(q) ?? false)
      ) {
        return false
      }
      return true
    })
  }, [items, filter, category, query])

  async function markOne(id: string) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(
      () => undefined,
    )
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    )
  }

  async function markAll() {
    setMarking(true)
    try {
      await fetch("/api/notifications/read-all", { method: "POST" })
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })))
    } finally {
      setMarking(false)
    }
  }

  const unreadCount = items.filter((n) => n.readAt === null).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificações"
        description={`${items.length} no total · ${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`}
        actions={
          <>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Recarregar
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={marking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-50"
              >
                {marking ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                Marcar todas
              </button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => typeof v === "string" && setTab(v as Tab)}>
        <TabsList className="bg-[var(--color-pmb-mist,#f7faf7)]">
          <TabsTrigger value="feed" className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)]">
            Feed
          </TabsTrigger>
          <TabsTrigger value="preferences" className="data-active:bg-white data-active:text-[var(--color-pmb-green,#025918)]">
            Preferências
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "preferences" ? (
        <NotificationPreferencesPanel />
      ) : (
        <>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por título ou conteúdo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-[var(--color-pmb-green)] focus:outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-gray-300 bg-white p-0.5">
            {(["all", "unread"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f
                    ? "bg-[var(--color-pmb-green)] text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {f === "all" ? "Todas" : "Não lidas"}
              </button>
            ))}
          </div>
          {categories.length > 1 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Todas as categorias" : c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <TableRowsSkeleton rows={5} cols={2} />
        ) : error ? (
          <div className="px-6 py-10 text-center text-sm text-red-700">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              filter === "unread"
                ? "Nenhuma notificação não lida"
                : "Nenhuma notificação"
            }
            description="Quando algo importante acontecer, você verá aqui."
            className="border-0"
          />
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((n) => {
              const Icon = LEVEL_ICON[n.level]
              const isRead = n.readAt !== null
              const inner = (
                <div
                  className={`flex items-start gap-4 px-5 py-4 ${
                    isRead ? "" : "bg-[var(--color-pmb-lime-50)]/30"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${LEVEL_CLASS[n.level]}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className={`text-sm ${
                          isRead
                            ? "font-medium text-gray-700"
                            : "font-semibold text-[var(--color-pmb-green-900)]"
                        }`}
                      >
                        {n.title}
                      </p>
                      {!isRead && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--color-pmb-green)]" />
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-1 text-xs text-gray-600">{n.body}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                      <span className="font-mono">
                        {fmtDateTime(n.createdAt)}
                      </span>
                      {n.category && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold uppercase tracking-wide text-gray-600">
                          {n.category}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
              return (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      onClick={() => !isRead && markOne(n.id)}
                      className="block transition-colors hover:bg-gray-50"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !isRead && markOne(n.id)}
                      className="block w-full text-left transition-colors hover:bg-gray-50"
                    >
                      {inner}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
        </>
      )}
    </div>
  )
}
