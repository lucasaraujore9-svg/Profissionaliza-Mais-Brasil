"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  CircleX,
  Info,
  Loader2,
} from "lucide-react"

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

// Polling adaptativo:
// - Aba ativa: 15s (pega eventos rapido)
// - Aba escondida (background): pausa
// - Volta para foreground: dispara load imediato
const ACTIVE_POLL_MS = 15_000

const LEVEL_ICON: Record<Notification["level"], React.ComponentType<{ className?: string }>> = {
  INFO: Info,
  SUCCESS: CircleCheck,
  WARNING: CircleAlert,
  ERROR: CircleX,
}

const LEVEL_CLASS: Record<Notification["level"], string> = {
  INFO: "text-sky-600 bg-sky-50",
  SUCCESS: "text-emerald-600 bg-emerald-50",
  WARNING: "text-amber-600 bg-amber-50",
  ERROR: "text-rose-600 bg-rose-50",
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} d`
  return new Date(iso).toLocaleDateString("pt-BR")
}

interface NotificationBellProps {
  variant?: "light" | "dark"
}

export function NotificationBell({ variant = "light" }: NotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [marking, setMarking] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const seeAllHref = pathname?.startsWith("/admin")
    ? "/admin/notificacoes"
    : pathname?.startsWith("/painel")
      ? "/painel/notificacoes"
      : pathname?.startsWith("/aluno")
        ? "/aluno/notificacoes"
        : "/aluno/notificacoes"

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications?limit=20", {
        cache: "no-store",
      })
      if (!res.ok) return
      const body = await res.json()
      setItems(body.data?.items ?? [])
      setUnread(body.data?.unreadCount ?? 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (interval !== null) return
      interval = setInterval(load, ACTIVE_POLL_MS)
    }
    const stop = () => {
      if (interval === null) return
      clearInterval(interval)
      interval = null
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        load()
        start()
      } else {
        stop()
      }
    }
    const onFocus = () => {
      load()
      start()
    }

    load()
    start()
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", onFocus)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

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
    setUnread((u) => Math.max(0, u - 1))
  }

  async function markAll() {
    setMarking(true)
    try {
      await fetch("/api/notifications/read-all", { method: "POST" })
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? now })))
      setUnread(0)
    } finally {
      setMarking(false)
    }
  }

  const buttonClass =
    variant === "dark"
      ? "relative rounded-lg p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
      : "relative rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100 hover:text-[var(--color-pmb-green-900)]"

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClass}
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-2xl border border-gray-200 bg-white shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                Notificações
              </h3>
              <p className="text-[11px] text-gray-500">
                {unread === 0
                  ? "Tudo em dia"
                  : `${unread} não lida${unread === 1 ? "" : "s"}`}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={marking}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--color-pmb-green)] hover:bg-[var(--color-pmb-lime-50)] disabled:opacity-50"
              >
                {marking ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCheck className="h-3 w-3" />
                )}
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-500">
                Carregando...
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-gray-500">
                Nenhuma notificação ainda.
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {items.map((n) => {
                  const Icon = LEVEL_ICON[n.level]
                  const isRead = n.readAt !== null
                  const content = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 ${
                        isRead ? "" : "bg-[var(--color-pmb-lime-50)]/30"
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${LEVEL_CLASS[n.level]}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs ${
                            isRead
                              ? "font-medium text-gray-700"
                              : "font-semibold text-[var(--color-pmb-green-900)]"
                          }`}
                        >
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-600">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-500">
                          {timeAgo(n.createdAt)}
                          {n.category ? ` · ${n.category}` : ""}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--color-pmb-green)]" />
                      )}
                    </div>
                  )
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link
                          href={n.href}
                          onClick={() => {
                            if (!isRead) markOne(n.id)
                            setOpen(false)
                          }}
                          className="block transition-colors hover:bg-gray-50"
                        >
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => !isRead && markOne(n.id)}
                          className="block w-full text-left transition-colors hover:bg-gray-50"
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="border-t border-gray-100 px-4 py-2 text-center">
            <Link
              href={seeAllHref}
              onClick={() => setOpen(false)}
              className="text-[11px] font-semibold text-[var(--color-pmb-green)] hover:underline"
            >
              Ver todas as notificações
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
