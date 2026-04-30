"use client"

import { useEffect, useState } from "react"
import { Download, X } from "lucide-react"

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

const DISMISS_KEY = "pmb-pwa-install-dismissed"
const SESSION_SHOWN_KEY = "pmb-pwa-install-shown-session"
const DISMISS_DAYS = 7

function wasRecentlyDismissed(): boolean {
  if (typeof window === "undefined") return true
  const raw = localStorage.getItem(DISMISS_KEY)
  if (!raw) return false
  const ts = Number(raw)
  if (Number.isNaN(ts)) return false
  return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000
}

function alreadyShownThisSession(): boolean {
  if (typeof window === "undefined") return true
  return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1"
}

function markShownThisSession(): void {
  if (typeof window === "undefined") return
  sessionStorage.setItem(SESSION_SHOWN_KEY, "1")
}

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    // Bloqueio em duas camadas:
    // - localStorage (7 dias): respeita "Agora não" / instalação por uma semana
    // - sessionStorage (1 sessão): garante que so apareça UMA vez por aba/visita,
    //   mesmo navegando entre páginas
    if (wasRecentlyDismissed() || alreadyShownThisSession()) return

    function handler(e: Event) {
      e.preventDefault()
      // Marca imediatamente como exibido nesta sessão para o evento nao
      // disparar de novo em proximas paginas
      markShownThisSession()
      setEvent(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener("beforeinstallprompt", handler as EventListener)

    function installed() {
      setVisible(false)
      setEvent(null)
      markShownThisSession()
    }
    window.addEventListener("appinstalled", installed)

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handler as EventListener,
      )
      window.removeEventListener("appinstalled", installed)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    markShownThisSession()
  }

  async function install() {
    if (!event) return
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === "accepted") {
      setVisible(false)
      setEvent(null)
      markShownThisSession()
    } else {
      dismiss()
    }
  }

  if (!visible || !event) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-[var(--color-pmb-green)]/30 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-pmb-green)] text-white">
          <Download className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
            Instalar Profissionaliza no celular
          </p>
          <p className="mt-0.5 text-xs text-gray-600">
            Acesse offline, receba notificações e tenha o app na tela inicial.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={dismiss}
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          Agora não
        </button>
        <button
          type="button"
          onClick={install}
          className="flex-1 rounded-lg bg-[var(--color-pmb-green)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--color-pmb-green-700)]"
        >
          Instalar
        </button>
      </div>
    </div>
  )
}
