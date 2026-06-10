"use client"

import Script from "next/script"
import { useMemo } from "react"
import { baseScripts } from "@/lib/tracking/snippets"
import type { TrackingPixels as TrackingPixelsConfig } from "@/lib/tracking/schema"

/**
 * Injeta os pixels de rastreamento (GA4, Google Ads, GTM, Meta, TikTok,
 * LinkedIn, Pinterest, Microsoft UET, Clarity, Hotjar) automaticamente no
 * acesso — o aviso de cookies é apenas informativo, sem gate de consentimento.
 * Recebe a config já mesclada (PMB + revenda) resolvida no servidor.
 */
export function TrackingPixels({ pixels }: { pixels: TrackingPixelsConfig }) {
  const scripts = useMemo(() => baseScripts(pixels), [pixels])

  if (scripts.length === 0) return null

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
