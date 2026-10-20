"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Caixinha "Não sou um robô" (reCAPTCHA v2) dos checkouts públicos.
 * O servidor confere o token em `lib/checkout/human-check.ts`.
 *
 * Sem `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` não desenha nada e `required` é false —
 * o servidor também só exige quando as duas chaves existem.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? ""
const HEADER = "x-recaptcha-token"
const MISSING_MESSAGE = "Marque a caixa \"Não sou um robô\" para continuar."

interface Grecaptcha {
  render(el: HTMLElement, opts: Record<string, unknown>): number
  reset(id?: number): void
}
declare global {
  interface Window {
    grecaptcha?: Grecaptcha
    __pmbRecaptchaReady?: () => void
  }
}

let scriptPromise: Promise<Grecaptcha> | null = null
function loadRecaptcha(): Promise<Grecaptcha> {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha)
  scriptPromise ??= new Promise((resolve, reject) => {
    window.__pmbRecaptchaReady = () => resolve(window.grecaptcha!)
    const s = document.createElement("script")
    s.src = "https://www.google.com/recaptcha/api.js?onload=__pmbRecaptchaReady&render=explicit&hl=pt-BR"
    s.async = true
    s.onerror = () => {
      scriptPromise = null
      reject(new Error("recaptcha"))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

export interface RecaptchaControl {
  /** Elemento a colocar no formulário, acima do botão de pagar. */
  element: React.ReactNode
  /** Há caixinha a marcar (chave configurada). */
  required: boolean
  token: string | null
  /** Mensagem para quando a pessoa tenta enviar sem marcar; `null` = pode enviar. */
  missingMessage: () => string | null
  /** Cabeçalho a juntar em TODA chamada de checkout do envio. */
  headers: () => Record<string, string>
  /** Chamar depois de cada envio: o token só vale uma vez. */
  reset: () => void
}

/** Rotas que conferem a caixinha no servidor (`rejectBot` com captcha). */
export function isPublicCheckoutPath(path: string | undefined): boolean {
  return !!path && /^\/api\/(loja\/)?checkout(\/|$)/.test(path)
}

/**
 * `enabled`: false quando o formulário fala com rotas do aluno logado
 * (`/api/aluno/*`), que não pedem a caixinha.
 */
export function useRecaptcha(enabled = true): RecaptchaControl {
  const ref = useRef<HTMLDivElement>(null)
  const widget = useRef<number | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!SITE_KEY || !enabled || !ref.current) return
    let cancelled = false
    loadRecaptcha()
      .then((g) => {
        if (cancelled || !ref.current || widget.current !== null) return
        widget.current = g.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        })
      })
      .catch(() => !cancelled && setLoadError(true))
    return () => {
      cancelled = true
    }
  }, [enabled])

  const reset = useCallback(() => {
    setToken(null)
    if (widget.current !== null) window.grecaptcha?.reset(widget.current)
  }, [])

  const required = !!SITE_KEY && enabled
  return {
    required,
    token,
    reset,
    headers: (): Record<string, string> => (required && token ? { [HEADER]: token } : {}),
    missingMessage: () => (required && !token ? MISSING_MESSAGE : null),
    element: required ? (
      <div className="flex flex-col items-start gap-1">
        <div ref={ref} />
        {loadError && (
          <p className="text-sm text-red-600">
            Não foi possível carregar a verificação &quot;Não sou um robô&quot;. Desative o
            bloqueador de anúncios ou atualize a página.
          </p>
        )}
      </div>
    ) : null,
  }
}
