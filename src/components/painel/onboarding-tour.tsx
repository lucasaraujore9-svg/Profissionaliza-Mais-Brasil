"use client"

import { useEffect, useRef } from "react"
import "driver.js/dist/driver.css"

/** Espelha session.user.memberRole ("owner" | "consultant" | null). */
type MemberRole = "owner" | "consultant" | null

/**
 * Tutorial guiado de primeiro acesso (spotlight + balão "Próximo").
 *
 * - Roteiros distintos por papel: `owner` (revendedor dono) vê todos os
 *   módulos; `consultant` (consultor convidado pelo revendedor) vê o
 *   subconjunto que de fato aparece na sidebar dele.
 * - Auto-inicia 1x por usuário (controle em users.onboarding_tour_completed_at).
 *   Só dispara em telas grandes (lg+), onde a sidebar fica fixa — no mobile
 *   ela vive num drawer e o spotlight não teria âncora. O usuário pode
 *   reabrir pelo botão de ajuda no header (evento `pmb:replay-tour`).
 * - driver.js é carregado sob demanda (dynamic import) pra não pesar no bundle.
 */

interface TourStep {
  /** Seletor CSS do alvo. Ausente = passo centralizado (sem destaque). */
  selector?: string
  title: string
  description: string
  side?: "left" | "right" | "top" | "bottom"
  align?: "start" | "center" | "end"
}

const WELCOME: TourStep = {
  title: "Bem-vindo(a)! 👋",
  description:
    "Em menos de 1 minuto vamos te mostrar onde fica cada coisa no seu painel. Use <b>Próximo</b> para avançar — ou feche no X a qualquer momento.",
}

const NAV = (path: string): string => `[data-tour="nav:${path}"]`

const OWNER_STEPS: TourStep[] = [
  WELCOME,
  {
    selector: NAV("/painel"),
    title: "Dashboard",
    description:
      "Sua visão geral: receita, alunos e conversão no período que você escolher.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/cursos"),
    title: "Catálogo",
    description:
      "Escolha quais cursos vender, defina preços e organize o que aparece na sua vitrine.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/alunos"),
    title: "Alunos",
    description:
      "Acompanhe quem comprou, status de acesso e histórico de cada aluno.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/vendas"),
    title: "Vendas diretas",
    description:
      "Registre vendas feitas por fora da vitrine (presencial, WhatsApp) e matricule o aluno na hora.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/cupons"),
    title: "Cupons",
    description:
      "Crie cupons de desconto para campanhas e parceiros.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/financeiro"),
    title: "Financeiro",
    description:
      "Acompanhe seu faturamento, repasses e a mensalidade da plataforma.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/indicacoes"),
    title: "Indicações",
    description:
      "Indique outros revendedores e acompanhe suas comissões de indicação.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/certificados"),
    title: "Certificados",
    description:
      "Configure o modelo e emita certificados para os alunos que concluírem.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/vitrine"),
    title: "Vitrine ✨",
    description:
      "Comece por aqui! Personalize o visual da sua loja: logo, banner, cores e seções da home.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/dominio"),
    title: "Domínio",
    description:
      "Use seu endereço grátis em livrecursos.com.br ou conecte um domínio próprio.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/configuracoes"),
    title: "Configurações",
    description:
      "Conecte sua conta do Mercado Pago para receber os pagamentos e ajuste os dados do negócio.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="tour-help"]',
    title: "Precisa rever?",
    description:
      "Sempre que quiser, clique aqui para repetir este tutorial.",
    side: "bottom",
    align: "end",
  },
  {
    title: "Pronto para começar 🚀",
    description:
      "Sugestão: vá em <b>Configurações</b> para conectar o Mercado Pago e depois em <b>Vitrine</b> para deixar sua loja com a sua cara.",
  },
]

const CONSULTANT_STEPS: TourStep[] = [
  WELCOME,
  {
    selector: NAV("/painel"),
    title: "Dashboard",
    description:
      "Sua visão geral de vendas e desempenho no período escolhido.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/cursos"),
    title: "Catálogo",
    description:
      "Veja os cursos disponíveis para vender e seus preços.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/alunos"),
    title: "Alunos",
    description:
      "Acompanhe os alunos e o status de acesso de cada um.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/vendas"),
    title: "Vendas diretas",
    description:
      "Seu dia a dia: registre uma venda e matricule o aluno na hora. É aqui que você lança suas vendas.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/cupons"),
    title: "Cupons",
    description:
      "Aplique cupons de desconto respeitando o limite definido pelo seu revendedor.",
    side: "right",
    align: "start",
  },
  {
    selector: NAV("/painel/financeiro"),
    title: "Financeiro",
    description:
      "Acompanhe as vendas que você realizou.",
    side: "right",
    align: "start",
  },
  {
    selector: '[data-tour="tour-help"]',
    title: "Precisa rever?",
    description:
      "Sempre que quiser, clique aqui para repetir este tutorial.",
    side: "bottom",
    align: "end",
  },
  {
    title: "Tudo certo 🚀",
    description:
      "Bom trabalho! Comece registrando sua primeira venda em <b>Vendas diretas</b>.",
  },
]

function stepsFor(role: MemberRole): TourStep[] {
  return role === "consultant" ? CONSULTANT_STEPS : OWNER_STEPS
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

export function OnboardingTour({
  memberRole,
  completed,
}: {
  memberRole: MemberRole
  completed: boolean
}) {
  // Evita POST duplicado de conclusão e re-start concorrente.
  const markedRef = useRef(false)
  const runningRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function run(markOnEnd: boolean) {
      if (runningRef.current) return
      runningRef.current = true

      const { driver } = await import("driver.js")
      if (cancelled) {
        runningRef.current = false
        return
      }

      const steps = visibleSteps(stepsFor(memberRole))
      // Só welcome+final visíveis (ex.: mobile sem sidebar) → não vale a pena.
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
          if (markOnEnd) void markCompleted()
        },
      })

      instance.drive()
    }

    async function markCompleted() {
      if (markedRef.current) return
      markedRef.current = true
      try {
        await fetch("/api/painel/onboarding-tour", { method: "POST" })
      } catch {
        // Falha de rede não deve reabrir o tour de forma agressiva; o
        // próximo carregamento tenta de novo se ainda não marcou no banco.
        markedRef.current = false
      }
    }

    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches

    // Auto-start no primeiro acesso (desktop). Pequeno atraso pra garantir
    // que a sidebar já montou antes de medir os alvos.
    let startTimer: ReturnType<typeof setTimeout> | undefined
    if (!completed && isDesktop) {
      startTimer = setTimeout(() => void run(true), 400)
    }

    // Reabrir manualmente pelo botão de ajuda (não re-marca: já está marcado).
    const onReplay = () => void run(false)
    window.addEventListener("pmb:replay-tour", onReplay)

    return () => {
      cancelled = true
      if (startTimer) clearTimeout(startTimer)
      window.removeEventListener("pmb:replay-tour", onReplay)
    }
  }, [memberRole, completed])

  return null
}
