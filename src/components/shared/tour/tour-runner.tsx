"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import "driver.js/dist/driver.css"
import {
  findTour,
  type MemberRole,
  type TourArea,
  type TourDef,
  type TourStep,
} from "@/lib/tours/registry"

/**
 * Engine genérico de tutoriais guiados (driver.js) para todas as páginas.
 *
 * Montado UMA vez por área (no shell do /painel e do /aluno), permanece vivo
 * enquanto o usuário navega dentro da área. A cada rota:
 *   - Descobre o tour ativo via `findTour(area, pathname, role)`.
 *   - Auto-inicia na 1ª visita da página (se ainda não foi dispensado e em
 *     tela grande, onde os alvos da sidebar/página existem).
 *   - Ao fechar (concluir ou X), marca o tour como visto e persiste
 *     (User/Student.dismissedTours) para não reabrir sozinho.
 *   - O botão de ajuda (data-tour="tour-help") dispara `pmb:replay-tour`, que
 *     reabre o tour da página atual mesmo já dispensado.
 *
 * driver.js é carregado sob demanda (dynamic import) para não pesar no bundle.
 */

interface TourRunnerProps {
  area: TourArea
  /** Papel do membro (painel). Para o aluno, passe null. */
  memberRole?: MemberRole
  /** Ids de tours já dispensados (do servidor). */
  dismissed?: string[]
}

/** Mantém só passos centralizados ou cujo alvo existe e está visível. */
function visibleSteps(steps: TourStep[]): TourStep[] {
  return steps.filter((s) => {
    if (!s.selector) return true
    const el = document.querySelector<HTMLElement>(s.selector)
    if (!el) return false
    return el.getClientRects().length > 0
  })
}

export function TourRunner({
  area,
  memberRole = null,
  dismissed = [],
}: TourRunnerProps) {
  const pathname = usePathname()
  // Set vivo de ids dispensados (semeado pelo servidor). Atualizado quando um
  // tour é fechado, para não auto-reabrir ao voltar à página na mesma sessão.
  const dismissedRef = useRef<Set<string>>(new Set(dismissed))
  // Ids já persistidos no servidor (evita POSTs duplicados).
  const persistedRef = useRef<Set<string>>(new Set(dismissed))
  // Tour em execução no momento (evita rodar dois ao mesmo tempo).
  const runningRef = useRef(false)
  // Última rota onde já tentamos auto-iniciar (evita re-trigger em re-render).
  const autoTriedRef = useRef<string | null>(null)

  // Mantém o Set sincronizado se o prop mudar (ex.: navegação que recarrega o
  // layout server). Une — nunca remove dispensas já conhecidas localmente.
  useEffect(() => {
    for (const id of dismissed) {
      dismissedRef.current.add(id)
      persistedRef.current.add(id)
    }
  }, [dismissed])

  useEffect(() => {
    let cancelled = false
    let startTimer: ReturnType<typeof setTimeout> | undefined

    async function persistDismissal(tourId: string) {
      if (persistedRef.current.has(tourId)) return
      persistedRef.current.add(tourId)
      try {
        await fetch("/api/tours/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tourId }),
        })
      } catch {
        // Falha de rede: desmarca para tentar de novo no próximo fechamento.
        persistedRef.current.delete(tourId)
      }
    }

    async function run(tour: TourDef) {
      if (runningRef.current) return
      runningRef.current = true

      const { driver } = await import("driver.js")
      if (cancelled) {
        runningRef.current = false
        return
      }

      const steps = visibleSteps(tour.steps)
      // Só passos centralizados visíveis (ex.: mobile sem sidebar/âncoras) →
      // não vale a pena; não marca como visto para poder mostrar depois.
      if (steps.filter((s) => s.selector).length === 0) {
        runningRef.current = false
        return
      }

      const instance = driver({
        showProgress: true,
        allowClose: true,
        overlayColor: "#02210c",
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 12,
        popoverClass: "pmb-tour",
        nextBtnText: "Próximo",
        prevBtnText: "Voltar",
        doneBtnText: "Concluir",
        progressText: "{{current}} de {{total}}",
        steps: steps.map((s) => ({
          element: s.selector,
          popover: {
            title: s.title,
            description: s.description,
            side: s.side ?? "bottom",
            align: s.align ?? "center",
          },
        })),
        onDestroyed: () => {
          runningRef.current = false
          // Fechou (concluiu ou X) = viu. Não auto-reabre mais.
          dismissedRef.current.add(tour.id)
          void persistDismissal(tour.id)
        },
      })

      instance.drive()
    }

    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches

    const active = findTour(area, pathname, memberRole)

    // Auto-início na 1ª visita: ainda não dispensado, desktop, e não tentamos
    // nesta rota ainda. Pequeno atraso para a sidebar/página montar os alvos.
    if (
      active &&
      isDesktop &&
      !dismissedRef.current.has(active.id) &&
      autoTriedRef.current !== pathname
    ) {
      autoTriedRef.current = pathname
      startTimer = setTimeout(() => void run(active), 500)
    }

    // Reabrir manualmente pelo botão de ajuda: roda o tour da rota atual mesmo
    // já dispensado.
    const onReplay = () => {
      const tour = findTour(area, pathname, memberRole)
      if (tour) void run(tour)
    }
    window.addEventListener("pmb:replay-tour", onReplay)

    return () => {
      cancelled = true
      if (startTimer) clearTimeout(startTimer)
      window.removeEventListener("pmb:replay-tour", onReplay)
    }
  }, [area, memberRole, pathname])

  return null
}
