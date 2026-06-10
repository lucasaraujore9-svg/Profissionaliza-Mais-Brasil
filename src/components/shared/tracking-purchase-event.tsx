"use client"

import Script from "next/script"
import { useMemo } from "react"
import { buildPurchaseInlineScript, type PurchasePayload } from "@/lib/tracking/snippets"
import type { TrackingPixels as TrackingPixelsConfig } from "@/lib/tracking/schema"

/**
 * Dispara o evento de conversão de compra (Purchase, com valor + moeda +
 * transaction_id) nos pixels que suportam, na página de confirmação de compra
 * aprovada. Deduplicado por transactionId em sessionStorage — não conta 2x em
 * refresh. Os pixels base são carregados pelo <TrackingPixels /> no layout;
 * aqui só disparamos o evento.
 */
export function TrackingPurchaseEvent({
  pixels,
  purchase,
}: {
  pixels: TrackingPixelsConfig
  purchase: PurchasePayload
}) {
  const inline = useMemo(
    () => buildPurchaseInlineScript(pixels, purchase),
    [pixels, purchase],
  )

  if (!inline) return null

  return (
    <Script
      id={`pmb-purchase-${purchase.transactionId}`}
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: inline }}
    />
  )
}
