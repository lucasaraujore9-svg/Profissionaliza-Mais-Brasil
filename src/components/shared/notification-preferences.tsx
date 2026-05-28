"use client"

import { useEffect, useState } from "react"
import { Bell, Mail, Loader2 } from "lucide-react"

interface Preference {
  category: string
  inApp: boolean
  email: boolean
}

const CATEGORY_LABELS: Record<string, { label: string; description: string }> = {
  payment: {
    label: "Pagamentos",
    description: "Cobranças confirmadas, mensalidades pagas, cobranças em atraso.",
  },
  enrollment: {
    label: "Matrículas",
    description: "Confirmação de compras, vínculos manuais, conclusões.",
  },
  "tenant-billing": {
    label: "Cobrança da revenda",
    description: "Mensalidade da sua conta, suspensão, reativação.",
  },
  tenant: {
    label: "Revendedores",
    description: "Novo revendedor, atribuição de gerente.",
  },
  sale: {
    label: "Vendas",
    description: "Notificações de novas vendas no painel.",
  },
  lead: {
    label: "Leads",
    description: "Novos interessados em virar revendedor.",
  },
  support: {
    label: "Suporte",
    description: "Mensagens diretas e tickets internos.",
  },
  referral: {
    label: "Indicações",
    description: "Comissões de indicação ganhas, liberadas ou canceladas.",
  },
  certificate: {
    label: "Certificados",
    description: "Emissão e revogação dos seus certificados.",
  },
}

export function NotificationPreferencesPanel() {
  const [items, setItems] = useState<Preference[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/notifications/preferences", {
          cache: "no-store",
        })
        const body = await res.json()
        if (!res.ok) {
          setError(body.error ?? "Falha ao carregar preferências")
          return
        }
        setItems(body.data?.preferences ?? [])
      } catch {
        setError("Erro de rede ao carregar preferências")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function toggle(
    category: string,
    channel: "inApp" | "email",
    next: boolean,
  ) {
    const key = `${category}:${channel}`
    setSavingKey(key)
    // Optimistic
    setItems((prev) =>
      prev.map((p) =>
        p.category === category ? { ...p, [channel]: next } : p,
      ),
    )
    try {
      await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, [channel]: next }),
      })
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando preferências...
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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
          Preferências de notificação
        </h2>
        <p className="mt-1 text-xs text-gray-600">
          Controle por categoria onde você quer receber alertas. Notificações
          críticas (suspensão de conta) sempre são entregues.
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        <div className="flex items-center gap-4 px-6 py-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          <div className="flex-1">Categoria</div>
          <div className="flex w-32 items-center justify-center gap-1">
            <Bell className="h-3 w-3" /> No app
          </div>
          <div className="flex w-32 items-center justify-center gap-1">
            <Mail className="h-3 w-3" /> Email
          </div>
        </div>
        {items.map((p) => {
          const meta = CATEGORY_LABELS[p.category] ?? {
            label: p.category,
            description: "",
          }
          const inAppKey = `${p.category}:inApp`
          const emailKey = `${p.category}:email`
          return (
            <div
              key={p.category}
              className="flex items-center gap-4 px-6 py-3 text-sm"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[var(--color-pmb-green-900)]">
                  {meta.label}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {meta.description}
                </p>
              </div>
              <Toggle
                checked={p.inApp}
                onChange={(v) => toggle(p.category, "inApp", v)}
                saving={savingKey === inAppKey}
              />
              <Toggle
                checked={p.email}
                onChange={(v) => toggle(p.category, "email", v)}
                saving={savingKey === emailKey}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  saving,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  saving: boolean
}) {
  return (
    <div className="flex w-32 justify-center">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={saving}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[var(--color-pmb-green)]" : "bg-gray-300"
        } disabled:opacity-50`}
      >
        <span
          className={`inline-flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        >
          {saving && <Loader2 className="h-2.5 w-2.5 animate-spin text-gray-500" />}
        </span>
      </button>
    </div>
  )
}
