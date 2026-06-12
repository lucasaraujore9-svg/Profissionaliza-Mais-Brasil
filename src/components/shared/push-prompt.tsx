"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Bell, X } from "lucide-react"
import { toast } from "sonner"
import {
  isPushSupported,
  getPushPermissionState,
  subscribeToPush,
} from "@/lib/notifications/push-client"

// Banner suave de opt-in de notificações para VISITANTES do site público.
// Estratégia: nunca dispara o prompt nativo automaticamente (Chrome/Safari
// bloqueiam e iOS exige gesto). Mostramos um convite discreto e só ao clicar
// em "Ativar" pedimos a permissão de fato — padrão recomendado, mais confiável
// e que evita "queimar" a permissão com um auto-block.

const SNOOZE_KEY = "pmb_push_prompt_v1"
const COOKIE_CONSENT_KEY = "pmb_cookie_consent_v1"
// Reaparece após este intervalo se o visitante apenas dispensou (sem decidir).
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 7 // 7 dias
// Espera após o consent de cookies para não empilhar dois banners.
const SHOW_DELAY_MS = 3500

// Áreas logadas/privadas têm seu próprio fluxo (sino de notificações,
// painel de dispositivos) — o banner público não aparece nelas.
const SUPPRESSED_PREFIXES = ["/admin", "/painel", "/aluno", "/login", "/cadastro", "/recuperar-senha", "/checkout"]

function isSnoozed(): boolean {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return true // valor legado/qualquer = já viu
    return Date.now() - ts < SNOOZE_MS
  } catch {
    return false
  }
}

function snooze() {
  try {
    window.localStorage.setItem(SNOOZE_KEY, String(Date.now()))
  } catch {
    /* quota cheia — segue o jogo */
  }
}

function cookieConsentDecided(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) !== null
  } catch {
    return true
  }
}

export function PushPrompt() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  const suppressed = SUPPRESSED_PREFIXES.some((p) => pathname?.startsWith(p))

  useEffect(() => {
    if (suppressed) return
    if (!isPushSupported()) return
    if (getPushPermissionState() !== "default") return // já concedeu/negou
    if (isSnoozed()) return

    let showTimer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const scheduleShow = () => {
      showTimer = setTimeout(() => {
        // revalida no momento de exibir (estado pode ter mudado)
        if (
          !cancelled &&
          getPushPermissionState() === "default" &&
          !isSnoozed()
        ) {
          setVisible(true)
        }
      }, SHOW_DELAY_MS)
    }

    if (cookieConsentDecided()) {
      scheduleShow()
      return () => {
        cancelled = true
        if (showTimer) clearTimeout(showTimer)
      }
    }

    // Aguarda o visitante fechar o aviso de cookies antes de aparecer.
    const onConsent = () => {
      if (cookieConsentDecided()) {
        window.removeEventListener("pmb-consent-changed", onConsent)
        scheduleShow()
      }
    }
    window.addEventListener("pmb-consent-changed", onConsent)
    return () => {
      cancelled = true
      if (showTimer) clearTimeout(showTimer)
      window.removeEventListener("pmb-consent-changed", onConsent)
    }
  }, [suppressed, pathname])

  async function handleEnable() {
    if (busy) return
    setBusy(true)
    try {
      const result = await subscribeToPush()
      if (result === "granted") {
        toast.success("Notificações ativadas! Você vai receber nossas novidades.")
      } else if (result === "denied") {
        toast.info(
          "Notificações bloqueadas. Você pode liberar depois nas configurações do navegador.",
        )
      }
    } catch {
      toast.error("Não foi possível ativar agora. Tente novamente mais tarde.")
    } finally {
      // independente do resultado, não insiste nesta sessão
      snooze()
      setBusy(false)
      setVisible(false)
    }
  }

  function handleDismiss() {
    snooze()
    setVisible(false)
  }

  if (suppressed || !visible) return null

  return (
    <div
      role="dialog"
      aria-label="Ativar notificações"
      className="pointer-events-auto fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-3xl rounded-2xl border border-[var(--color-pmb-green)]/15 bg-white p-4 shadow-2xl md:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-pmb-lime-50)] text-[var(--color-pmb-green)]">
            <Bell className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--color-pmb-green-900)]">
              Quer receber novidades?
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-gray-600">
              Ative as notificações e seja o primeiro a saber de novos cursos,
              promoções e descontos exclusivos — direto no seu navegador.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:ml-auto">
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="rounded-lg bg-[var(--color-pmb-green)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--color-pmb-green-700)] disabled:opacity-60"
          >
            {busy ? "Ativando…" : "Ativar"}
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fechar"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 md:hidden"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
