"use client"

import { useEffect } from "react"

/**
 * Orquestrador único de animações da landing.
 * Procura por elementos com [data-reveal] e [data-stagger] e anima
 * conforme entram na viewport. Carregado lazy via dynamic import pra
 * evitar peso no bundle inicial.
 */
export function LandingAnimations() {
  useEffect(() => {
    let killTriggers: (() => void) | undefined
    let prefers: MediaQueryList | null = null
    const handleMotionChange = () => {
      if (prefers?.matches) {
        document.querySelectorAll<HTMLElement>("[data-reveal], [data-stagger] > *").forEach((el) => {
          el.style.opacity = "1"
          el.style.transform = "none"
        })
      }
    }

    ;(async () => {
      const gsapMod = await import("gsap")
      const stMod = await import("gsap/ScrollTrigger")
      const gsap = gsapMod.gsap ?? gsapMod.default
      const ScrollTrigger = stMod.ScrollTrigger ?? stMod.default
      gsap.registerPlugin(ScrollTrigger)

      prefers = window.matchMedia("(prefers-reduced-motion: reduce)")
      if (prefers.matches) {
        handleMotionChange()
        return
      }
      prefers.addEventListener("change", handleMotionChange)

      // 1) Reveal solo: elementos com [data-reveal]
      const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]")
      reveals.forEach((el) => {
        const delay = Number(el.dataset.revealDelay ?? "0")
        const y = Number(el.dataset.revealY ?? "20")
        gsap.set(el, { opacity: 0, y })
        ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          once: true,
          onEnter: () => {
            gsap.to(el, {
              opacity: 1,
              y: 0,
              duration: 0.9,
              delay,
              ease: "power2.out",
            })
          },
        })
      })

      // 2) Stagger groups: filhos diretos de [data-stagger]
      // Exclui filhos com aria-hidden (linhas decorativas, etc).
      const groups = gsap.utils.toArray<HTMLElement>("[data-stagger]")
      groups.forEach((group) => {
        const items = Array.from(group.children).filter(
          (c) => !(c as HTMLElement).hasAttribute("aria-hidden"),
        ) as HTMLElement[]
        const stagger = Number(group.dataset.staggerStep ?? "0.07")
        const y = Number(group.dataset.staggerY ?? "16")
        gsap.set(items, { opacity: 0, y })
        ScrollTrigger.create({
          trigger: group,
          start: "top 85%",
          once: true,
          onEnter: () => {
            gsap.to(items, {
              opacity: 1,
              y: 0,
              duration: 0.7,
              stagger,
              ease: "power2.out",
            })
          },
        })
      })

      // 3) Parallax sutil em [data-parallax]
      const parallaxes = gsap.utils.toArray<HTMLElement>("[data-parallax]")
      parallaxes.forEach((el) => {
        const intensity = Number(el.dataset.parallax ?? "30")
        gsap.to(el, {
          y: -intensity,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        })
      })

      // 4) Marker highlight draw: [data-marker]
      const markers = gsap.utils.toArray<HTMLElement>("[data-marker]")
      markers.forEach((el) => {
        gsap.set(el, { scaleX: 0, transformOrigin: "left center" })
        ScrollTrigger.create({
          trigger: el,
          start: "top 80%",
          once: true,
          onEnter: () => {
            gsap.to(el, {
              scaleX: 1,
              duration: 0.9,
              ease: "power3.out",
              delay: 0.25,
            })
          },
        })
      })

      killTriggers = () => {
        ScrollTrigger.getAll().forEach((t) => t.kill())
        prefers?.removeEventListener("change", handleMotionChange)
      }
    })()

    return () => killTriggers?.()
  }, [])

  return null
}
