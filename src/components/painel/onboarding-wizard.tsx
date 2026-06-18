"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  PartyPopper,
  User,
  Globe,
  Palette,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const steps = [
  { id: 1, label: "Boas-vindas", icon: PartyPopper },
  { id: 2, label: "Conta", icon: User },
  { id: 3, label: "Domínio", icon: Globe },
  { id: 4, label: "Vitrine", icon: Palette },
  { id: 5, label: "Conclusão", icon: Sparkles },
] as const

interface StepContent {
  title: string
  description: string
  href?: string
  hrefLabel?: string
}

const STEP_DETAILS: Record<number, StepContent> = {
  2: {
    title: "Confirme seus dados",
    description:
      "Antes de seguir, abra Configurações → Conta e revise seu nome, email e dados da empresa. Tudo certo? Volte aqui e clique em Próximo.",
    href: "/painel/configuracoes",
    hrefLabel: "Abrir configurações",
  },
  3: {
    title: "Defina seu endereço na internet",
    description:
      "Sua escola precisa de um endereço. Você pode usar o subdomínio gratuito (algo.livrecursos.com.br) ou apontar um domínio próprio que já comprou.",
    href: "/painel/dominio",
    hrefLabel: "Configurar domínio",
  },
  4: {
    title: "Personalize a vitrine",
    description:
      "Envie sua logo, escolha as cores da sua marca e escreva o texto de boas-vindas. É isso que seus alunos vão ver primeiro.",
    href: "/painel/vitrine",
    hrefLabel: "Editar vitrine",
  },
}

export function OnboardingWizard() {
  const router = useRouter()
  const [current, setCurrent] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [finished, setFinished] = useState(false)

  async function persistStep(step: number, completed: boolean) {
    setError(null)
    setSaving(true)
    try {
      const response = await fetch("/api/painel/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, completed }),
      })
      if (!response.ok) {
        const json = await response.json().catch(() => null)
        setError(json?.error ?? "Erro ao salvar etapa")
        return false
      }
      return true
    } catch {
      setError("Erro de rede")
      return false
    } finally {
      setSaving(false)
    }
  }

  async function handleNext() {
    if (current === steps.length) return

    const ok = await persistStep(current, true)
    if (!ok) return

    const nextStep = current + 1
    setCurrent(nextStep)

    if (nextStep === steps.length) {
      const activated = await persistStep(steps.length, true)
      if (activated) {
        setFinished(true)
      }
    }
  }

  function handlePrevious() {
    setError(null)
    setCurrent((v) => Math.max(1, v - 1))
  }

  function handleGoToPanel() {
    router.push("/painel")
    router.refresh()
  }

  const stepDetails = STEP_DETAILS[current]

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-5">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon
            const isDone = step.id < current
            const isActive = step.id === current
            return (
              <div key={step.id} className="flex flex-1 items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-xs font-semibold transition-all ${
                      isDone
                        ? "border-[var(--color-pmb-green)] bg-[var(--color-pmb-green)] text-white"
                        : isActive
                          ? "border-[var(--color-pmb-green)] bg-white text-[var(--color-pmb-green)] shadow"
                          : "border-gray-200 bg-white text-gray-400"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`text-[10px] font-medium md:block ${
                      isActive ? "block" : "hidden"
                    } ${
                      isActive ? "text-[var(--color-pmb-green-900)]" : "text-gray-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-2 mb-4 h-0.5 flex-1 ${
                      isDone ? "bg-[var(--color-pmb-green)]" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="min-h-[240px] px-6 py-8">
        {current === 1 && (
          <div className="text-center">
            <PartyPopper className="mx-auto h-12 w-12 text-[var(--color-pmb-green)]" />
            <h3 className="mt-4 text-lg font-bold text-[var(--color-pmb-green-900)]">
              Bem-vindo à Profissionaliza Mais Brasil
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Vamos preparar sua vitrine em 4 passos rápidos. Leva menos de 10
              minutos e você pode pausar a qualquer momento — voltamos do
              ponto onde você parou.
            </p>
          </div>
        )}

        {stepDetails && (
          <div className="mx-auto max-w-lg">
            <h3 className="text-lg font-bold text-[var(--color-pmb-green-900)]">
              {stepDetails.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              {stepDetails.description}
            </p>
            {stepDetails.href && stepDetails.hrefLabel && (
              <Link
                href={stepDetails.href}
                target="_blank"
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--color-pmb-green)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-pmb-green-700)]"
              >
                {stepDetails.hrefLabel}
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
            <p className="mt-4 text-xs text-gray-500">
              Abrimos em uma nova guia para você não perder o passo a passo.
            </p>
          </div>
        )}

        {current === 5 && (
          <div className="text-center">
            <Sparkles className="mx-auto h-12 w-12 text-[var(--color-pmb-green)]" />
            <h3 className="mt-4 text-lg font-bold text-[var(--color-pmb-green-900)]">
              {finished ? "Tudo pronto!" : "Ativando sua conta..."}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              {finished
                ? "Sua vitrine está no ar. Agora é hora de compartilhar o link com os primeiros alunos e começar a vender."
                : "Estamos finalizando a ativação. Aguarde um instante."}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-xs text-red-600">{error}</p>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
        <Button
          variant="outline"
          disabled={current === 1 || saving || finished}
          onClick={handlePrevious}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Anterior
        </Button>
        <span className="text-xs text-gray-500">
          Etapa {current} de {steps.length}
        </span>
        {current < steps.length ? (
          <Button
            size={current === steps.length - 1 ? "lg" : "default"}
            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            disabled={saving}
            onClick={handleNext}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : current === steps.length - 1 ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Finalizar
              </>
            ) : (
              <>
                Próximo
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        ) : (
          <Button
            className="bg-[var(--color-pmb-green)] text-white hover:bg-[var(--color-pmb-green-700)]"
            disabled={!finished}
            onClick={handleGoToPanel}
          >
            Ir para o painel
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </footer>
    </div>
  )
}
