"use client"

import Link from "next/link"
import { useEffect, useState, useSyncExternalStore } from "react"

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

/** Subscreve a prefers-reduced-motion sem acessar ref/setState no render. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED_MOTION_QUERY)
      mq.addEventListener("change", onChange)
      return () => mq.removeEventListener("change", onChange)
    },
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  )
}

export interface HeroSlide {
  id: string
  desktopUrl: string
  mobileUrl: string
  linkUrl?: string | null
}

interface HeroSlidesProps {
  slides: HeroSlide[]
  /** Intervalo do auto-rotate em ms. 0 = desativa. */
  intervalMs?: number
  /**
   * Conteúdo exibido quando NENHUMA imagem do banner consegue carregar (ex.:
   * Storage indisponível/402). Sem ele, um banner com imagens quebradas deixaria
   * um bloco preto na tela. O caller (`HeroBanner`) passa o hero padrão da
   * unidade — com os cursos/preços da própria revenda — como fallback.
   */
  fallback?: React.ReactNode
}

/**
 * `true` quando TODAS as imagens do banner falharam ao carregar. Usado para cair
 * no hero padrão em vez de exibir um bloco preto (banner sem imagem utilizável).
 * Pura de propósito — a decisão é unit-testável sem DOM.
 */
export function allBannersFailed(
  failed: ReadonlySet<number>,
  total: number,
): boolean {
  return total > 0 && failed.size >= total
}

/**
 * Hero "imagem-only": ocupa 100% da largura da página, sem headline/busca/badges
 * por cima. A imagem é exibida inteira (nunca recortada) — a altura acompanha a
 * largura naturalmente (`w-full h-auto`). Em telas estreitas (<768px) troca para
 * a versão mobile via `<picture>`, ficando completamente responsiva.
 *
 * Os slides são empilhados na mesma célula de grid (`row/col-start-1`), então o
 * container assume a altura natural da imagem e o crossfade acontece por opacity
 * sem recortar nada.
 */
export function HeroSlides({
  slides,
  intervalMs = 6000,
  fallback = null,
}: HeroSlidesProps) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  // Índices dos slides cuja imagem falhou ao carregar (onError). Quando todos
  // falham, cai no `fallback` (hero padrão) — nunca deixa a tela preta.
  const [failed, setFailed] = useState<ReadonlySet<number>>(() => new Set())
  const total = slides.length

  // Respeita prefers-reduced-motion: desativa auto-rotação se o usuário preferir.
  const prefersReduced = usePrefersReducedMotion()
  const autoRotate = !paused && !prefersReduced

  useEffect(() => {
    if (total <= 1 || intervalMs <= 0 || !autoRotate) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % total)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [total, intervalMs, autoRotate])

  if (total === 0) return <>{fallback}</>

  // Todas as imagens quebraram (ex.: Storage 402/indisponível): em vez de um
  // bloco preto, renderiza o hero padrão da unidade.
  if (allBannersFailed(failed, total)) return <>{fallback}</>

  const markFailed = (i: number) =>
    setFailed((prev) => {
      if (prev.has(i)) return prev
      const next = new Set(prev)
      next.add(i)
      return next
    })

  return (
    <section
      aria-label="Banner principal"
      aria-roledescription="carousel"
      className="relative w-full overflow-hidden bg-[var(--color-pmb-green)]"
    >
      {/* Slides empilhados na mesma célula: o container assume a altura natural
          da imagem (full width, sem corte). Mobile (<768px) usa a imagem 1:1. */}
      <div className="grid w-full">
        {slides.map((slide, i) => {
          const isActive = i === index
          const img = (
            <picture>
              <source media="(min-width: 768px)" srcSet={slide.desktopUrl} />
              <img
                src={slide.mobileUrl}
                alt=""
                className="block h-auto w-full"
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
                onError={() => markFailed(i)}
              />
            </picture>
          )
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`col-start-1 row-start-1 transition-opacity duration-700 ease-in-out ${
                isActive ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              {slide.linkUrl ? (
                <Link
                  href={slide.linkUrl}
                  className="block h-full w-full"
                  aria-label={`Ir para ${slide.linkUrl}`}
                >
                  {img}
                </Link>
              ) : (
                img
              )}
            </div>
          )
        })}
      </div>

      {total > 1 && (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2 md:bottom-5">
          {slides.map((s, i) => {
            const isActive = i === index
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Ir para slide ${i + 1}`}
                aria-current={isActive}
                className={`h-2 rounded-full transition-all ${
                  isActive
                    ? "w-6 bg-white"
                    : "w-2 bg-white/55 hover:bg-white/80"
                }`}
              />
            )
          })}
          {/* Botão de pausar/retomar — WCAG 2.2.2 */}
          {!prefersReduced && (
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              aria-label={paused ? "Retomar rotação automática" : "Pausar rotação automática"}
              aria-pressed={paused}
              className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/30 text-white hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1"
            >
              {paused ? (
                <svg viewBox="0 0 8 8" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
                  <polygon points="0,0 8,4 0,8" />
                </svg>
              ) : (
                <svg viewBox="0 0 8 8" fill="currentColor" className="h-2.5 w-2.5" aria-hidden="true">
                  <rect x="0" y="0" width="3" height="8" />
                  <rect x="5" y="0" width="3" height="8" />
                </svg>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
