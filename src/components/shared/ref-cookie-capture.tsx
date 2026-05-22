"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

/**
 * Le `?ref=CODIGO` na URL, valida via /api/public/validate-ref e,
 * se valido, grava o cookie httpOnly `pmb_referral` via /api/public/capture-ref.
 *
 * Renderiza um banner discreto ("Indicado por X") quando o codigo for valido.
 * Permanece transparente quando ausente / invalido.
 */
export function RefCookieCapture() {
  const searchParams = useSearchParams()
  const [tenantName, setTenantName] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams?.get("ref")?.trim()
    if (!code) return

    let cancelled = false
    async function capture() {
      try {
        const validation = await fetch(
          `/api/public/validate-ref?code=${encodeURIComponent(code as string)}`,
        )
        if (!validation.ok) return
        const body = (await validation.json()) as {
          valid?: boolean
          tenantName?: string
        }
        if (!body.valid || !body.tenantName) return

        // Grava cookie httpOnly
        await fetch("/api/public/capture-ref", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        }).catch(() => undefined)

        if (!cancelled) setTenantName(body.tenantName)
      } catch {
        // silencioso — feature nao-critica
      }
    }
    capture()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  if (!tenantName) return null

  return (
    <div className="bg-[var(--color-pmb-green-900)] text-white text-center text-sm py-2 px-4">
      Voce foi indicado por <span className="font-semibold">{tenantName}</span>.
      Ao se tornar revendedor, ele recebera uma comissao.
    </div>
  )
}
