"use client"

import { useEffect, useState, useTransition } from "react"
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

/**
 * Aba "Rastreamento" do painel do revendedor. Configura os pixels da própria
 * vitrine. Os pixels disparam só após o consentimento de cookies do visitante.
 */
export function TrackingForm() {
  const [state, setState] = useState<TrackingFormState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    fetch("/api/painel/tracking")
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? "Erro ao carregar")
        return json.data as TrackingPixels
      })
      .then((pixels) => {
        if (!cancelled) setState(toTrackingFormState(pixels))
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Erro ao carregar")
      })
    return () => {
      cancelled = true
    }
  }, [])

  function submit() {
    if (!state) return
    startTransition(async () => {
      const res = await fetch("/api/painel/tracking", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trackingFormStateToPayload(state)),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const firstField = body?.fields
          ? (Object.values(body.fields)[0] as string[] | undefined)?.[0]
          : undefined
        toast.error(firstField ?? body?.error ?? "Falha ao salvar")
        return
      }
      setState(toTrackingFormState(body.data as TrackingPixels))
      toast.success("Pixels de rastreamento salvos")
    })
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {loadError}
      </div>
    )
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-10 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        Os pixels disparam apenas após o visitante aceitar os cookies (LGPD). Cole
        somente o ID de cada plataforma — os scripts são montados automaticamente.
      </div>

      <TrackingPixelsFields state={state} onChange={setState} disabled={pending} />

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={pending}
          className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar pixels
        </Button>
      </div>
    </div>
  )
}
