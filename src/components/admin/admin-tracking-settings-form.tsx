"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  TrackingPixelsFields,
  toTrackingFormState,
  trackingFormStateToPayload,
  type TrackingFormState,
} from "@/components/shared/tracking-pixels-fields"
import type { TrackingPixels } from "@/lib/tracking/schema"

type Scope = "self" | "global"

const SCOPES: { id: Scope; label: string; description: string }[] = [
  {
    id: "self",
    label: "Site PMB",
    description: "Pixels do site institucional e da vitrine própria da PMB.",
  },
  {
    id: "global",
    label: "Todas as vitrines",
    description:
      "Pixels injetados em TODAS as vitrines dos revendedores (visão consolidada do ecossistema).",
  },
]

export function AdminTrackingSettingsForm({
  initial,
}: {
  initial: { self: TrackingPixels; global: TrackingPixels }
}) {
  const [active, setActive] = useState<Scope>("self")
  const [pending, startTransition] = useTransition()
  const [forms, setForms] = useState<Record<Scope, TrackingFormState>>({
    self: toTrackingFormState(initial.self),
    global: toTrackingFormState(initial.global),
  })

  function setActiveForm(next: TrackingFormState) {
    setForms((f) => ({ ...f, [active]: next }))
  }

  function submit() {
    startTransition(async () => {
      const res = await fetch("/api/admin/system-settings/tracking", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: active,
          pixels: trackingFormStateToPayload(forms[active]),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const firstField = body?.fields
          ? (Object.values(body.fields)[0] as string[] | undefined)?.[0]
          : undefined
        toast.error(firstField ?? body?.error ?? "Falha ao salvar")
        return
      }
      const data = body.data as { self: TrackingPixels; global: TrackingPixels }
      setForms({
        self: toTrackingFormState(data.self),
        global: toTrackingFormState(data.global),
      })
      toast.success("Pixels atualizados")
    })
  }

  const activeMeta = SCOPES.find((s) => s.id === active)!

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
        {SCOPES.map((scope) => (
          <button
            key={scope.id}
            type="button"
            onClick={() => setActive(scope.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active === scope.id
                ? "bg-[var(--color-pmb-green)] text-white shadow-sm"
                : "text-gray-600 hover:text-[var(--color-pmb-green-900)]"
            }`}
          >
            {scope.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-500">{activeMeta.description}</p>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        Os pixels disparam apenas após o consentimento de cookies (LGPD). Se um
        revendedor configurar o mesmo provedor na própria vitrine, o pixel da
        revenda prevalece sobre o global.
      </div>

      <TrackingPixelsFields
        state={forms[active]}
        onChange={setActiveForm}
        disabled={pending}
      />

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={pending}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar — {activeMeta.label}
        </Button>
      </div>
    </div>
  )
}
