"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

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
}

/**
 * Hero "imagem-only": ocupa 100% da hero, sem headline/busca/badges por cima.
 * Mantém aspect-ratio diferente para desktop (16:5 = 1920x600) e mobile (1:1 = 1080x1080)
 * via `<picture>` + media query.
 */
export function HeroSlides({ slides, intervalMs = 6000 }: HeroSlidesProps) {
  const [index, setIndex] = useState(0)
  const total = slides.length

  useEffect(() => {
    if (total <= 1 || intervalMs <= 0) return
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % total)
    }, intervalMs)
    return () => window.clearInterval(id)
  }, [total, intervalMs])

  if (total === 0) return null

  return (
    <section
      aria-label="Banner principal"
      className="relative w-full overflow-hidden bg-black"
    >
      {/* Aspect ratio: 1:1 no mobile, 16:5 no desktop (matches 1920x600). */}
      <div className="relative w-full aspect-square md:aspect-[16/5]">
        {slides.map((slide, i) => {
          const isActive = i === index
          const img = (
            <picture>
              <source media="(min-width: 768px)" srcSet={slide.desktopUrl} />
              <img
                src={slide.mobileUrl}
                alt=""
                className="h-full w-full object-cover"
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
              />
            </picture>
          )
          return (
            <div
              key={slide.id}
              aria-hidden={!isActive}
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
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
        </div>
      )}
    </section>
  )
}
