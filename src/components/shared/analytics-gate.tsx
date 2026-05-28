"use client"

import { useSyncExternalStore } from "react"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"

const STORAGE_KEY = "pmb_cookie_consent_v1"

function readConsent(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback)
  window.addEventListener("pmb-consent-changed", callback)
  return () => {
    window.removeEventListener("storage", callback)
    window.removeEventListener("pmb-consent-changed", callback)
  }
}

/**
 * Renderiza Analytics + SpeedInsights SOMENTE quando o usuário
 * aceitou cookies opcionais (pmb_cookie_consent_v1 = "accepted").
 * Reage em tempo real à mudança de consentimento sem reload.
 */
export function AnalyticsGate() {
  const consent = useSyncExternalStore(
    subscribe,
    readConsent,
    () => null, // server snapshot: não renderiza no SSR
  )

  if (consent !== "accepted") return null

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
