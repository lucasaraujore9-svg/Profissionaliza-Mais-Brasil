"use client"

import Script from "next/script"
import { useMemo } from "react"
import { baseScripts } from "@/lib/tracking/snippets"
import type { TrackingPixels as TrackingPixelsConfig } from "@/lib/tracking/schema"
import { useCookieConsentAccepted } from "./use-cookie-consent"

/**
 * Injeta os pixels de rastreamento (GA4, Google Ads, GTM, Meta, TikTok,
 * LinkedIn, Pinterest, Microsoft UET, Clarity, Hotjar) SOMENTE após o
 * consentimento LGPD (pmb_cookie_consent_v1 = "accepted"). Recebe a config já
 * mesclada (global PMB + revenda) resolvida no servidor.
 */
export function TrackingPixels({ pixels }: { pixels: TrackingPixelsConfig }) {
  const accepted = useCookieConsentAccepted()
  const scripts = useMemo(() => baseScripts(pixels), [pixels])

  if (!accepted || scripts.length === 0) return null

  return (
    <>
      {scripts.map((s) =>
        s.src ? (
          <Script key={s.id} id={s.id} src={s.src} strategy={s.strategy ?? "afterInteractive"} />
        ) : (
          <Script
            key={s.id}
            id={s.id}
            strategy={s.strategy ?? "afterInteractive"}
            dangerouslySetInnerHTML={{ __html: s.inline ?? "" }}
          />
        ),
      )}
    </>
  )
}
