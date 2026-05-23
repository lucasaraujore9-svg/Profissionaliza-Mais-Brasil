"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Lock, RotateCcw } from "lucide-react"

type ConfigTarget = "TENANT" | "STUDENT" | "ADMIN"
type Level = "INFO" | "SUCCESS" | "WARNING" | "ERROR"

interface ConfigItem {
  target: ConfigTarget
  category: string
  label: string
  description: string | null
  enabled: boolean
  defaultLevel: Level
  /** Sinaliza override individual de tenant (apenas painel revenda) */
  overridden?: boolean
  /** Globalmente desligado pelo admin master — não pode reativar */
  locked?: boolean
  /** Valor real do kill-switch global (para mostrar no painel revenda) */
  globalEnabled?: boolean
}

interface AutoConfigPanelProps {
  target: ConfigTarget
  /** Quando true, mostra como visualização (toggles desabilitados) */
  readOnly?: boolean
  title?: string
  description?: string
  /** URL custom de listagem. Default /api/admin/notifications/auto-config?target=... */
  fetchUrl?: string
  /** URL custom para PATCH. Default /api/admin/notifications/auto-config */
  patchUrl?: string
  /** Quando true, PATCH envia apenas { category, enabled } (sem target) */
  patchWithoutTarget?: boolean
}

export function AutoConfigPanel({
  target,
  readOnly = false,
  title,
  description,
  fetchUrl,
  patchUrl,
  patchWithoutTarget = false,
}: AutoConfigPanelProps) {
  const [items, setItems] = useState<ConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = fetchUrl ?? `/api/admin/notifications/auto-config?target=${target}`
      const res = await fetch(url, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? "Falha ao carregar")
        return
      }
      setItems(json.data?.items ?? [])
    } catch {
      setError("Erro de rede")
    } finally {
      setLoading(false)
    }
  }, [target, fetchUrl])

  useEffect(() => {
    load()
  }, [load])

  async function toggle(category: string, enabled: boolean) {
    if (readOnly) return
    const key = `${category}:enabled`
    setSavingKey(key)
    setFeedback(null)

    // Optimistic
    const prevItems = items
    setItems((prev) =>
      prev.map((p) =>
        p.category === category
          ? { ...p, enabled, overridden: !enabled }
          : p,
      ),
    )

    try {
      const url = patchUrl ?? "/api/admin/notifications/auto-config"
      const payload = patchWithoutTarget
        ? { category, enabled }
        : { target, category, enabled }
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        setItems(prevItems)
        setFeedback(j?.error ?? "Não foi possível salvar")
        return
      }
      // recarrega para refletir flags (overridden, etc.)
      await load()
    } catch {
      setItems(prevItems)
      setFeedback("Erro de rede")
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          {title ?? "Notificações automáticas"}
        </h2>
        {description && (
          <p className="mt-1 text-xs text-gray-600">{description}</p>
        )}
      </div>

      {feedback && (
        <div className="mx-6 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {feedback}
        </div>
      )}

      {loading ? (
        <div className="p-10 text-center text-sm text-gray-500">
          Carregando...
        </div>
      ) : error ? (
        <div className="p-6 text-sm text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <div className="p-6 text-sm text-gray-500">
          Nenhuma categoria automática configurada.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((p) => {
            const key = `${p.category}:enabled`
            return (
              <li
                key={p.category}
                className="flex items-start gap-4 px-6 py-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--color-pmb-green-900)]">
                    {p.label}
                    {p.overridden && !p.locked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <RotateCcw className="h-2.5 w-2.5" />
                        Personalizado para sua revenda
                      </span>
                    )}
                    {p.locked && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                        <Lock className="h-2.5 w-2.5" />
                        Desligado globalmente
                      </span>
                    )}
                  </p>
                  {p.description && (
                    <p className="mt-1 text-xs text-gray-600">
                      {p.description}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] font-mono uppercase tracking-wide text-gray-400">
                    {p.category}
                  </p>
                </div>
                <Toggle
                  checked={p.enabled}
                  onChange={(v) => toggle(p.category, v)}
                  saving={savingKey === key}
                  disabled={readOnly || p.locked}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  saving,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  saving: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={saving || disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[var(--color-pmb-green)]" : "bg-gray-300"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""} disabled:opacity-50`}
    >
      <span
        className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      >
        {saving && (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-500" />
        )}
      </span>
    </button>
  )
}
