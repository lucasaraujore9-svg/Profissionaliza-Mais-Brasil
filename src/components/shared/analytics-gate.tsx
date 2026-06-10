"use client"

import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"

/**
 * Renderiza Analytics + SpeedInsights automaticamente no acesso. O aviso de
 * cookies (CookieConsent) é apenas informativo — não há gate de consentimento.
 */
export function AnalyticsGate() {
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
