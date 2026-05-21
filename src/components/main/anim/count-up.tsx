"use client"

import { useEffect, useRef, useState } from "react"

interface CountUpProps {
  target: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
  /** Format target as 1.5M / 1,2K / etc. */
  compact?: boolean
}

const ptBr = new Intl.NumberFormat("pt-BR")

function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    const millions = value / 1_000_000
    return `${millions.toFixed(millions >= 10 ? 0 : 1).replace(".", ",")}M`
  }
  if (value >= 1000) {
    const thousands = value / 1000
    return `${thousands.toFixed(thousands >= 10 ? 0 : 1).replace(".", ",")}K`
  }
  return ptBr.format(value)
}

/**
 * Anima de 0 até `target` quando o elemento entra na viewport.
 * Usa anime.js. Respeita prefers-reduced-motion (mostra direto).
 */
export function CountUp({
  target,
  duration = 1400,
  prefix = "",
  suffix = "",
  className,
  compact = false,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const started = useRef(false)
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (typeof window === "undefined") return

    if (
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target)
      return
    }

    let cleanup: (() => void) | undefined

    ;(async () => {
      const { animate } = await import("animejs")

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting || started.current) return
            started.current = true
            const obj = { v: 0 }
            animate(obj, {
              v: target,
              duration,
              ease: "outQuart",
              onUpdate: () => setValue(Math.round(obj.v)),
              onComplete: () => setValue(target),
            })
            observer.disconnect()
          })
        },
        { threshold: 0.4 },
      )

      if (ref.current) observer.observe(ref.current)
      cleanup = () => observer.disconnect()
    })()

    return () => cleanup?.()
  }, [target, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {compact ? formatCompact(value) : ptBr.format(value)}
      {suffix}
    </span>
  )
}
