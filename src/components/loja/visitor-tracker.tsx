"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

/**
 * Rastreador de navegacao do visitante. Montado nos layouts da vitrine (loja e
 * main) apenas quando o modulo de automacao esta ativo. A cada mudanca de rota
 * envia um page view para /api/loja/track, que grava um VisitorEvent atrelado
 * ao cookie anonimo pmb_vid. Apos a captura do lead, esses eventos sao herdados
 * e exibidos na timeline do CRM.
 *
 * Nao renderiza nada. Falhas sao silenciosas — tracking nunca afeta a UX.
 */
export function VisitorTracker() {
  const pathname = usePathname()
  // Evita disparo duplicado para o mesmo path (StrictMode / re-render).
  const lastPath = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return
    if (lastPath.current === pathname) return
    lastPath.current = pathname

    // courseSlug: extrai de /curso/[slug] e /cursos/[slug] (vitrine e PMB).
    const courseMatch = pathname.match(/^\/cursos?\/([^/?#]+)/)
    const courseSlug = courseMatch ? decodeURIComponent(courseMatch[1]) : null

    const body = JSON.stringify({
      path: pathname,
      title: typeof document !== "undefined" ? document.title : null,
      courseSlug,
      referrer:
        typeof document !== "undefined" && document.referrer
          ? document.referrer
          : null,
    })

    // keepalive garante o envio mesmo se o usuario navegar/fechar a aba.
    void fetch("/api/loja/track", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      // silencioso — tracking e best-effort
    })
  }, [pathname])

  return null
}
