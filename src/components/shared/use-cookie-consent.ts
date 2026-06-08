"use client"

import { useSyncExternalStore } from "react"

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
 * True quando o usuário aceitou cookies opcionais (LGPD). Reage em tempo real à
 * mudança de consentimento sem reload. Mesma fonte de verdade do AnalyticsGate
 * (chave pmb_cookie_consent_v1 + evento pmb-consent-changed). No SSR retorna
 * false (não renderiza trackers no servidor).
 */
export function useCookieConsentAccepted(): boolean {
  const consent = useSyncExternalStore(subscribe, readConsent, () => null)
  return consent === "accepted"
}
