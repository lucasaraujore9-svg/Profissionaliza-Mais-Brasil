"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  TRACKING_PROVIDERS,
  type TrackingCategory,
  type TrackingPixels,
} from "@/lib/tracking/schema"

/**
 * Estado editável do formulário: para cada provedor, a flag enabled + os valores
 * (string) de cada campo. Componente puramente apresentacional — fetch/save fica
 * nos wrappers (painel/admin).
 */
export type TrackingFormState = Record<string, Record<string, string | boolean>>

const CATEGORY_LABELS: Record<TrackingCategory, string> = {
  analytics: "Analytics",
  ads: "Anúncios / Conversão",
  heatmap: "Mapa de calor / Gravação",
}

/** Converte a config persistida em estado de formulário (todos os campos como string). */
export function toTrackingFormState(pixels: TrackingPixels | null | undefined): TrackingFormState {
  const state: TrackingFormState = {}
  for (const provider of TRACKING_PROVIDERS) {
    const current = (pixels?.[provider.key] ?? {}) as Record<string, unknown>
    const entry: Record<string, string | boolean> = {
      enabled: current.enabled !== false,
    }
    for (const field of provider.fields) {
      const v = current[field.key]
      entry[field.key] = typeof v === "string" ? v : ""
    }
    state[provider.key] = entry
  }
  return state
}

/** Monta o payload da API a partir do estado (omite provedores sem ID principal). */
export function trackingFormStateToPayload(state: TrackingFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const provider of TRACKING_PROVIDERS) {
    const entry = state[provider.key]
    if (!entry) continue
    const idValue = entry[provider.idField]
    if (typeof idValue !== "string" || idValue.trim() === "") continue
    const obj: Record<string, unknown> = { enabled: entry.enabled !== false }
    for (const field of provider.fields) {
      const v = entry[field.key]
      if (typeof v === "string" && v.trim() !== "") obj[field.key] = v.trim()
    }
    payload[provider.key] = obj
  }
  return payload
}

export function TrackingPixelsFields({
  state,
  onChange,
  disabled,
}: {
  state: TrackingFormState
  onChange: (next: TrackingFormState) => void
  disabled?: boolean
}) {
  function update(providerKey: string, field: string, value: string | boolean) {
    onChange({
      ...state,
      [providerKey]: { ...state[providerKey], [field]: value },
    })
  }

  const categories: TrackingCategory[] = ["analytics", "ads", "heatmap"]

  return (
    <div className="space-y-8">
      {categories.map((category) => {
        const providers = TRACKING_PROVIDERS.filter((p) => p.category === category)
        if (providers.length === 0) return null
        return (
          <section key={category} className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {CATEGORY_LABELS[category]}
            </h3>
            <div className="space-y-4">
              {providers.map((provider) => {
                const entry = state[provider.key] ?? {}
                const enabled = entry.enabled !== false
                return (
                  <div
                    key={provider.key}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">
                          {provider.label}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">{provider.help}</p>
                      </div>
                      <Switch
                        checked={enabled}
                        disabled={disabled}
                        onCheckedChange={(v) => update(provider.key, "enabled", v)}
                        aria-label={`Ativar ${provider.label}`}
                      />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {provider.fields.map((field) => (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs">
                            {field.label}
                            {field.optional && (
                              <span className="ml-1 font-normal text-gray-400">(opcional)</span>
                            )}
                          </Label>
                          <Input
                            value={(entry[field.key] as string) ?? ""}
                            placeholder={field.placeholder}
                            disabled={disabled || !enabled}
                            onChange={(e) => update(provider.key, field.key, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
