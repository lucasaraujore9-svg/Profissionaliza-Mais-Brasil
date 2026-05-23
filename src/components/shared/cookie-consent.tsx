"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Cookie } from "lucide-react"

const STORAGE_KEY = "pmb_cookie_consent_v1"
const ACCEPTED = "accepted"
const REJECTED = "rejected"

function readConsent(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeConsent(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
    // Cookie complementar para que o server possa ler em rotas futuras
    // (analytics opt-in/out). 6 meses; revogavel limpando o localStorage.
    document.cookie = `${STORAGE_KEY}=${value}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`
  } catch {
    // ignora storage cheio / quota
  }
}

export function CookieConsent() {
  const [decided, setDecided] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    setDecided(readConsent())
  }, [])

  if (decided === undefined || decided === ACCEPTED || decided === REJECTED) {
    return null
  }

  function accept() {
    writeConsent(ACCEPTED)
    setDecided(ACCEPTED)
  }

  function reject() {
    writeConsent(REJECTED)
    setDecided(REJECTED)
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
              A gente usa cookies
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              Cookies essenciais mantêm o site funcionando. Cookies opcionais
              (análise de uso) ajudam a melhorar a experiência. Você pode
              aceitar ou rejeitar os opcionais a qualquer momento.{" "}
              <Link
                href="/privacidade"
                className="font-semibold text-[var(--color-pmb-green)] underline"
              >
                Saiba mais
              </Link>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:ml-auto md:flex-nowrap">
          <button
            type="button"
            onClick={reject}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Recusar opcionais
          </button>
          <button
            type="button"
            onClick={accept}
            className="rounded-lg bg-[var(--color-pmb-green)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--color-pmb-green-700)]"
          >
            Aceitar todos
          </button>
        </div>
      </div>
    </div>
  )
}
