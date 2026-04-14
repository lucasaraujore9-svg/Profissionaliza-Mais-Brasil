"use client"

import { useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
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

export function OnboardingWizard() {
  const [current, setCurrent] = useState(1)

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
                        ? "border-blue-600 bg-blue-600 text-white"
                        : isActive
                          ? "border-blue-600 bg-white text-blue-600 shadow"
                          : "border-gray-200 bg-white text-gray-400"
                    }`}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`hidden text-[10px] font-medium md:block ${
                      isActive ? "text-[#1A1A2E]" : "text-gray-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-2 mb-4 h-0.5 flex-1 ${
                      isDone ? "bg-blue-600" : "bg-gray-200"
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
            <PartyPopper className="mx-auto h-12 w-12 text-blue-600" />
            <h3 className="mt-4 text-lg font-bold text-[#1A1A2E]">
              Bem-vindo à Profissionaliza Mais Brasil
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Vamos preparar sua vitrine em 4 passos rápidos. Leva menos de 10
              minutos.
            </p>
          </div>
        )}
        {current === 2 && (
          <div>
            <h3 className="text-lg font-bold text-[#1A1A2E]">Confirme seus dados</h3>
            <p className="mt-1 text-sm text-gray-600">
              Valide nome, email e empresa antes de seguir.
            </p>
          </div>
        )}
        {current === 3 && (
          <div>
            <h3 className="text-lg font-bold text-[#1A1A2E]">Defina seu endereço</h3>
            <p className="mt-1 text-sm text-gray-600">
              Escolha o subdomínio gratuito ou aponte um domínio próprio.
            </p>
          </div>
        )}
        {current === 4 && (
          <div>
            <h3 className="text-lg font-bold text-[#1A1A2E]">Personalize a vitrine</h3>
            <p className="mt-1 text-sm text-gray-600">
              Envie o logo, escolha cores e escreva o texto de boas-vindas.
            </p>
          </div>
        )}
        {current === 5 && (
          <div className="text-center">
            <Sparkles className="mx-auto h-12 w-12 text-blue-600" />
            <h3 className="mt-4 text-lg font-bold text-[#1A1A2E]">
              Tudo pronto!
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">
              Sua vitrine está no ar. Agora é hora de compartilhar com os
              primeiros alunos.
            </p>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
        <Button
          variant="outline"
          disabled={current === 1}
          onClick={() => setCurrent((v) => Math.max(1, v - 1))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Anterior
        </Button>
        <span className="text-xs text-gray-500">
          Etapa {current} de {steps.length}
        </span>
        <Button
          className="bg-blue-600 text-white hover:bg-blue-700"
          disabled={current === steps.length}
          onClick={() => setCurrent((v) => Math.min(steps.length, v + 1))}
        >
          {current === steps.length - 1 ? "Finalizar" : "Próximo"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </footer>
    </div>
  )
}
