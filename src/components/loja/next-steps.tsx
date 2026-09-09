"use client"

import { useEffect, useState } from "react"
import { Mail, LogIn, BookOpen } from "lucide-react"

const STUDENT_AREA_URL = "/aluno"
const REDIRECT_SECONDS = 5

/**
 * Os três passos falam do que a pessoa ACABOU de comprar.
 *
 * "Seu curso já está liberado. Assista quando e onde quiser" num e-book é uma
 * promessa falsa entregue no pior momento possível: logo depois do pagamento,
 * quando ela ainda não abriu o produto e a única referência que tem é esta tela.
 */
function stepsFor(ebook: boolean) {
  return [
    {
      icon: Mail,
      title: "Verifique seu email",
      description: "Enviamos suas credenciais de acesso para o email cadastrado.",
    },
    {
      icon: LogIn,
      title: ebook ? "Acesse sua área do aluno" : "Acesse sua área de aulas",
      description: "Faça login na plataforma com os dados recebidos por email.",
    },
    {
      icon: BookOpen,
      title: ebook ? "Comece a ler" : "Comece a estudar",
      description: ebook
        ? "Seu e-book já está liberado. Leia no celular ou no computador, quantas vezes quiser."
        : "Seu curso já está liberado. Assista quando e onde quiser.",
    },
  ]
}

interface NextStepsProps {
  autoRedirect?: boolean
  /** O que foi comprado. Ausente = curso, o caso da esmagadora maioria. */
  contentType?: "COURSE" | "EBOOK"
}

export function NextSteps({ autoRedirect = false, contentType }: NextStepsProps) {
  const steps = stepsFor(contentType === "EBOOK")
  const [seconds, setSeconds] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    if (!autoRedirect) return
    if (seconds <= 0) {
      window.location.href = STUDENT_AREA_URL
      return
    }
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [autoRedirect, seconds])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
      <h2 className="text-base font-semibold text-[var(--color-pmb-green-900)]">Próximos passos</h2>
      <p className="mt-1 text-sm text-gray-600">
        {autoRedirect
          ? `Você será redirecionado à plataforma em ${seconds} segundo${seconds === 1 ? "" : "s"}.`
          : "Assim que o pagamento for confirmado, você receberá suas credenciais por email."}
      </p>

      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex gap-4 rounded-xl border border-gray-100 bg-gray-50/50 p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-pmb-green)] text-white">
              <step.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[var(--color-pmb-green)]">
                  0{index + 1}
                </span>
                <span className="text-sm font-semibold text-[var(--color-pmb-green-900)]">
                  {step.title}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
