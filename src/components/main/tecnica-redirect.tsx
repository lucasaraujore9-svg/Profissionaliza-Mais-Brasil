"use client"

import { useEffect, useState } from "react"
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  GraduationCap,
  ShieldCheck,
} from "lucide-react"

interface TecnicaRedirectProps {
  url: string
  courseName?: string | null
  /**
   * Tempo (ms) que a tela permanece visível antes de redirecionar.
   * Calibrado em 7000ms para permitir leitura confortável do texto
   * institucional (~60 palavras + 3 selos).
   */
  delayMs?: number
}

const DEFAULT_DELAY_MS = 7000

export function TecnicaRedirect({
  url,
  courseName,
  delayMs = DEFAULT_DELAY_MS,
}: TecnicaRedirectProps) {
  const [remaining, setRemaining] = useState(() => Math.ceil(delayMs / 1000))
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    if (cancelled) return
    const start = Date.now()
    const tick = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((delayMs - (Date.now() - start)) / 1000))
      setRemaining(left)
    }, 250)
    const t = window.setTimeout(() => {
      window.location.href = url
    }, delayMs)
    return () => {
      window.clearInterval(tick)
      window.clearTimeout(t)
    }
  }, [url, delayMs, cancelled])

  // duração CSS (string) baseada no delay — barra completa exatamente em
  // sync com o timer do redirect.
  const progressDurationMs = `${delayMs}ms`

  return (
    <section className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[var(--color-pmb-mist)] px-4 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-[rgba(2,89,24,0.1)] bg-white p-7 shadow-[0_18px_40px_-18px_rgba(2,89,24,0.25)] sm:p-10">
        {/* Pill institucional */}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-pmb-lime)]/40 px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-widest text-[var(--color-pmb-green)]">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Escola Técnica parceira
        </span>

        {/* Headline */}
        <h1 className="mt-3 text-[22px] font-black leading-tight text-[var(--color-pmb-green)] sm:text-[26px]">
          Sua nova carreira começa aqui.
        </h1>

        {/* Body — copy revisada, mais aspiracional e clara */}
        <div className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-[rgba(2,89,24,0.78)]">
          <p>
            Estamos te conectando com a nossa{" "}
            <b>Escola Técnica parceira</b> — referência nacional em formação
            técnica.
          </p>
          <p>
            Em alguns segundos você vai poder conhecer{" "}
            {courseName ? (
              <>
                o curso de <b>{courseName}</b>
              </>
            ) : (
              <>os cursos disponíveis</>
            )}
            , escolher quando começar e dar o próximo passo na sua carreira —
            tudo com diploma reconhecido pelo MEC e mercado de trabalho real
            esperando por você.
          </p>
        </div>

        {/* Selos curtos */}
        <ul className="mt-5 grid gap-2 text-[13px] text-[rgba(2,89,24,0.78)] sm:grid-cols-3">
          <li className="flex items-center gap-2">
            <BadgeCheck
              className="h-4 w-4 shrink-0 text-[var(--color-pmb-green)]"
              aria-hidden
            />
            Diploma do MEC
          </li>
          <li className="flex items-center gap-2">
            <Clock3
              className="h-4 w-4 shrink-0 text-[var(--color-pmb-green)]"
              aria-hidden
            />
            A partir de 7 meses
          </li>
          <li className="flex items-center gap-2">
            <GraduationCap
              className="h-4 w-4 shrink-0 text-[var(--color-pmb-green)]"
              aria-hidden
            />
            Matrícula 100% online
          </li>
        </ul>

        {/* Barra de progresso + contagem (duração casa com delayMs) */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-[12px] font-medium text-[rgba(2,89,24,0.55)]">
            <span>{cancelled ? "Redirecionamento pausado" : "Redirecionando"}</span>
            <span>
              {cancelled
                ? "—"
                : remaining > 0
                  ? `${remaining}s`
                  : "indo…"}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(2,89,24,0.08)]">
            <div
              className="h-full rounded-full bg-[var(--color-pmb-green)] motion-safe:transition-[width] motion-safe:ease-linear motion-reduce:duration-0"
              style={{
                width: cancelled ? "0%" : "100%",
                transitionDuration: cancelled ? "0ms" : progressDurationMs,
                transitionDelay: cancelled ? "0s" : "60ms",
              }}
            />
          </div>
        </div>

        {/* Ações */}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={() => setCancelled(true)}
            disabled={cancelled}
            className="text-[13px] font-medium text-[rgba(2,89,24,0.6)] underline-offset-4 hover:underline disabled:cursor-default disabled:opacity-40 disabled:no-underline"
          >
            Cancelar redirecionamento
          </button>
          <a
            href={url}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-pmb-gold)] px-5 py-3 text-[14px] font-black text-[var(--color-pmb-green)] transition hover:bg-[var(--color-pmb-gold-600)]"
          >
            Ir agora
            <ArrowRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

        {cancelled && (
          <p className="mt-4 text-center text-[12px] text-[rgba(2,89,24,0.6)]">
            Quando quiser, é só clicar em <b>Ir agora</b>.
          </p>
        )}
      </div>
    </section>
  )
}
