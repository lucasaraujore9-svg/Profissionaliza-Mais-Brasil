"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { Cookie } from "lucide-react"

const STORAGE_KEY = "pmb_cookie_consent_v1"

function readConsent(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "accepted")
    // Cookie complementar para que o server possa ler em rotas futuras.
    // 6 meses; revogavel limpando o localStorage.
    document.cookie = `${STORAGE_KEY}=accepted; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`
    // Notifica a propria aba (event "storage" so dispara em outras abas).
    window.dispatchEvent(new Event("pmb-consent-changed"))
  } catch {
    // ignora storage cheio / quota
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
 * Aviso informativo de cookies. Os scripts de analytics/pixels carregam
 * automaticamente no acesso — este banner apenas informa o uso. Qualquer valor
 * já gravado (inclusive "rejected" legado) conta como "já viu o aviso".
 */
export function CookieConsent() {
  // useSyncExternalStore lê localStorage no mount sem setState-in-effect.
  // server snapshot = null (banner so aparece apos hydrate, evita mismatch).
  const decided = useSyncExternalStore(
    subscribe,
    readConsent,
    () => null,
  )

  if (decided !== null) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      className="pointer-events-auto fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-[var(--color-pmb-green)]/15 bg-white p-4 shadow-2xl md:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <Cookie className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--color-pmb-green-900)]">
              Este site usa cookies
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              Usamos cookies e tecnologias de medição para manter o site
              funcionando, analisar o uso e melhorar sua experiência. Ao
              continuar navegando, você concorda com essa utilização.{" "}
              <Link
                href="/privacidade"
                className="font-semibold text-[var(--color-pmb-green)] underline"
              >
                Saiba mais
              </Link>
            </p>
          </div>
        </div>

        <div className="flex items-center md:ml-auto">
          <button
            type="button"
            onClick={writeDismissed}
            className="rounded-lg bg-[var(--color-pmb-green)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            Entendi
          </button>
        </div>
      </div>
    </div>
  )
}
